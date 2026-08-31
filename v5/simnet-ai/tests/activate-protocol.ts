import { hexToBytes } from "@stacks/common";
import { Cl, ClarityType, privateKeyToPublic, randomPrivateKey, signMessageHashRsv } from "@stacks/transactions";

/** Mainnet PoX reward-cycle length (simnet default is 1050). */
const CYCLE_LENGTH = 2_100;
const PREPARE_LENGTH = 50;
const DIST_CYCLE_LENGTH = CYCLE_LENGTH / 2;
const REWARD_RELEASE_OFFSET = 432;
const AUTH_ID = 1;
const WEEKLY_REWARD_SATS = 10_000_000n;
const THRESHOLD_STAKE_USTX = 1_000_000_000_000n;
const SBTC_DEPOSIT_ROLE = hexToBytes("01");

export type RecordedCall = {
  contractId: string;
  functionName: string;
  sender: string;
  senderRole: string;
  amountStx: number;
  ok: boolean;
  result: string;
};

type TxSink = (tx: RecordedCall) => void;
let txSink: TxSink | undefined;

export function setProtocolTxSink(sink?: TxSink): void {
  txSink = sink;
}

function resultLabel(result: { type: string | number; value?: { value?: unknown } }): string {
  if (isOk(result)) return "ok";
  const code = result.value?.value;
  return code === undefined ? "err" : `err u${code}`;
}

function emitCall(
  deployer: string,
  name: string,
  functionName: string,
  sender: string,
  senderRole: string,
  result: { type: string | number; value?: { value?: unknown } },
  amountStx = 0
): void {
  txSink?.({
    contractId: `${deployer}.${name}`,
    functionName,
    sender,
    senderRole,
    amountStx,
    ok: isOk(result),
    result: resultLabel(result),
  });
}

function isOk(result: { type: string | number }): boolean {
  return result.type === ClarityType.ResponseOk;
}

function hexFromCv(cv: unknown): string {
  const walk = (value: unknown): string | undefined => {
    if (typeof value === "string") return value.replace(/^0x/, "");
    if (value instanceof Uint8Array) return Buffer.from(value).toString("hex");
    if (!value || typeof value !== "object") return undefined;
    const rec = value as { value?: unknown; buffer?: unknown };
    return walk(rec.value) ?? walk(rec.buffer);
  };
  const hex = walk(cv);
  if (!hex) throw new Error(`expected buffer, got ${JSON.stringify(cv)}`);
  return hex;
}

function uintFromCv(cv: unknown): bigint {
  if (typeof cv === "bigint") return cv;
  if (typeof cv === "number") return BigInt(cv);
  if (typeof cv === "string" && /^\d+$/.test(cv)) return BigInt(cv);
  if (cv && typeof cv === "object" && "value" in cv) return uintFromCv((cv as { value: unknown }).value);
  throw new Error(`expected uint, got ${JSON.stringify(cv)}`);
}

function tupleFromCv(cv: unknown): Record<string, unknown> {
  const unwrap = (value: unknown): unknown => {
    if (value && typeof value === "object" && "type" in value) {
      const rec = value as { type: string | number; value?: unknown };
      if (rec.type === ClarityType.ResponseOk || rec.type === "ok") return unwrap(rec.value);
      if (rec.type === ClarityType.OptionalSome || rec.type === "some") return unwrap(rec.value);
      if (rec.type === ClarityType.Tuple || rec.type === "tuple") return rec.value;
    }
    return value;
  };
  const inner = unwrap(cv);
  if (inner && typeof inner === "object" && "data" in inner) {
    return (inner as { data: Record<string, unknown> }).data;
  }
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    return inner as Record<string, unknown>;
  }
  throw new Error(`expected tuple, got ${JSON.stringify(cv)}`);
}

function bootSbtcTokenAndRegistry(platform: string): void {
  const name = simnet.callReadOnlyFn("sbtc-token", "get-name", [], platform);
  if (!isOk(name.result)) throw new Error(`sbtc-token.get-name failed: ${JSON.stringify(name.result)}`);

  const depositCaller = simnet.callReadOnlyFn(
    "sbtc-registry",
    "get-active-protocol",
    [Cl.buffer(SBTC_DEPOSIT_ROLE)],
    platform
  );
  const authorized = simnet.callReadOnlyFn(
    "sbtc-registry",
    "is-protocol-caller",
    [Cl.buffer(SBTC_DEPOSIT_ROLE), Cl.principal(platform)],
    platform
  );
  if (!isOk(authorized.result)) {
    throw new Error(`sbtc-registry deposit-role is not deployer: ${JSON.stringify({ depositCaller: depositCaller.result, authorized: authorized.result })}`);
  }
}

function mintSbtcToPox(platform: string, amount = WEEKLY_REWARD_SATS): void {
  const minted = simnet.callPublicFn(
    "sbtc-token",
    "protocol-mint",
    [Cl.uint(amount), Cl.principal(`${platform}.sim-pox-5`), Cl.buffer(SBTC_DEPOSIT_ROLE)],
    platform
  );
  emitCall(platform, "sbtc-token", "protocol-mint", platform, "platform", minted.result);
  if (!isOk(minted.result)) {
    throw new Error(`protocol-mint → sim-pox-5 failed: ${JSON.stringify(minted.result)}`);
  }
}

const MAX_STAKE_CYCLES = 96;

export function currentPoxCycle(platform: string): number {
  return Number(
    uintFromCv(simnet.callReadOnlyFn("sim-pox-5", "current-pox-reward-cycle", [], platform).result)
  );
}

/** burn height of `reward-release` after a 1-cycle stake that locked in `lockPoxCycle`. */
export function claimReleaseHeight(lockPoxCycle: number, stakedCycles = 1): number {
  return (lockPoxCycle + 1 + stakedCycles) * CYCLE_LENGTH + REWARD_RELEASE_OFFSET;
}

function isOptionalNone(cv: unknown): boolean {
  return !!(
    cv &&
    typeof cv === "object" &&
    "type" in cv &&
    ((cv as { type: string | number }).type === ClarityType.OptionalNone ||
      (cv as { type: string }).type === "none")
  );
}

function remainingCycles(platform: string, staker: string): number {
  const info = simnet.callReadOnlyFn("sim-pox-5", "get-staker-info", [Cl.principal(staker)], platform);
  if (isOptionalNone(info.result)) return 0;
  const data = tupleFromCv(info.result);
  const first = Number(uintFromCv(data["first-reward-cycle"]));
  const n = Number(uintFromCv(data["num-cycles"]));
  return first + n - currentPoxCycle(platform);
}

function stakeThreshold(platform: string, thresholdStaker: string): void {
  ensureNotPreparePhase(platform);
  const stake = simnet.callPublicFn(
    "sim-pox-5",
    "stake",
    [
      Cl.contractPrincipal(platform, "fastpool"),
      Cl.uint(THRESHOLD_STAKE_USTX),
      Cl.uint(MAX_STAKE_CYCLES),
      Cl.uint(simnet.burnBlockHeight),
      Cl.none(),
    ],
    thresholdStaker
  );
  emitCall(platform, "sim-pox-5", "stake", thresholdStaker, "threshold-staker", stake.result, Number(THRESHOLD_STAKE_USTX / 1_000_000n));
  if (!isOk(stake.result)) {
    throw new Error(`threshold stake failed: ${JSON.stringify(stake.result)}`);
  }
}

export function ensureThresholdStake(platform: string, thresholdStakers: string[]): void {
  const [primary, backup] = thresholdStakers;
  if (remainingCycles(platform, primary) <= 0) stakeThreshold(platform, primary);
  if (backup && remainingCycles(platform, primary) <= 50 && remainingCycles(platform, backup) <= 0) {
    stakeThreshold(platform, backup);
  }
  if (backup && remainingCycles(platform, backup) <= 0 && remainingCycles(platform, primary) <= 50) {
    stakeThreshold(platform, backup);
  }
}

/** Boot sBTC, sim-pox-5, and Fastpool the same way decast-contracts does, before any start/stake/claim. */
export function activateStakingStack(platform: string, thresholdStakers: string[]): void {
  bootSbtcTokenAndRegistry(platform);

  const boot = simnet.callPublicFn(
    "sim-pox-5",
    "set-burnchain-parameters",
    [Cl.uint(0), Cl.uint(PREPARE_LENGTH), Cl.uint(CYCLE_LENGTH), Cl.uint(0)],
    platform
  );
  emitCall(platform, "sim-pox-5", "set-burnchain-parameters", platform, "platform", boot.result);
  if (!isOk(boot.result)) {
    throw new Error(`set-burnchain-parameters failed: ${JSON.stringify(boot.result)}`);
  }

  const privateKey = randomPrivateKey();
  const signerKeyHex = privateKeyToPublic(privateKey);
  const { result: hashCv } = simnet.callReadOnlyFn(
    "sim-pox-5",
    "get-signer-grant-message-hash",
    [Cl.contractPrincipal(platform, "fastpool"), Cl.uint(AUTH_ID)],
    platform
  );
  const signerSigHex = signMessageHashRsv({
    messageHash: hexFromCv(hashCv),
    privateKey,
  });

  const registered = simnet.callPublicFn(
    "fastpool",
    "register-self",
    [
      Cl.contractPrincipal(platform, "fastpool"),
      Cl.buffer(hexToBytes(signerKeyHex.replace(/^0x/, ""))),
      Cl.uint(AUTH_ID),
      Cl.buffer(hexToBytes(signerSigHex.replace(/^0x/, ""))),
    ],
    platform
  );
  emitCall(platform, "fastpool", "register-self", platform, "platform", registered.result);
  if (!isOk(registered.result)) {
    throw new Error(`fastpool.register-self failed: ${JSON.stringify(registered.result)}`);
  }

  ensureThresholdStake(platform, thresholdStakers);
}

/** Mint yield into sim-pox-5, then crystallize Fastpool for the computed reward cycle (decast runWeeklyPayout). */
export function runWeeklyPayout(platform: string, rewardCycle?: number): void {
  mintSbtcToPox(platform);
  const calc = simnet.callPublicFn("sim-pox-5", "calculate-rewards", [Cl.list([])], platform);
  emitCall(platform, "sim-pox-5", "calculate-rewards", platform, "platform", calc.result);
  const cycle = isOk(calc.result)
    ? Number(uintFromCv(tupleFromCv(calc.result)["stx-cycle"]))
    : rewardCycle;
  if (cycle === undefined) return;
  const shares = simnet.callReadOnlyFn(
    "sim-pox-5",
    "get-total-shares-staked-for-cycle",
    [Cl.uint(cycle), Cl.none()],
    platform
  );
  if (uintFromCv(shares.result) === 0n) return;
  const poolClaim = simnet.callPublicFn("fastpool", "claim-rewards", [Cl.list([]), Cl.uint(cycle)], platform);
  emitCall(platform, "fastpool", "claim-rewards", platform, "platform", poolClaim.result);
}

/** Pay a staker from Fastpool (same as decast claim-staker-rewards after pool claim). */
export function payoutFastpoolToStaker(platform: string, staker: string, rewardCycle: number): void {
  runWeeklyPayout(platform, rewardCycle);
  const poolClaim = simnet.callPublicFn("fastpool", "claim-rewards", [Cl.list([]), Cl.uint(rewardCycle)], platform);
  emitCall(platform, "fastpool", "claim-rewards", platform, "platform", poolClaim.result);
  const stakerClaim = simnet.callPublicFn(
    "fastpool",
    "claim-staker-rewards",
    [Cl.principal(staker), Cl.uint(rewardCycle), Cl.none()],
    platform
  );
  emitCall(platform, "fastpool", "claim-staker-rewards", platform, "platform", stakerClaim.result);
}

export function payoutPotFromFastpool(platform: string, potId: string, sender: string): void {
  const meta = simnet.callReadOnlyFn(potId, "get-staking-meta", [], sender);
  const data = tupleFromCv(meta.result);
  const next = Number(uintFromCv(data["next-reward-cycle"]));
  const first = Number(uintFromCv(data["first-reward-cycle"]));
  const n = Number(uintFromCv(data["staked-cycles"]));
  const cycle = n <= 1 ? next || first : next;
  payoutFastpoolToStaker(platform, potId, cycle);
}

export function ensureNotPreparePhase(platform: string): void {
  const cycle = Number(
    uintFromCv(simnet.callReadOnlyFn("sim-pox-5", "current-pox-reward-cycle", [], platform).result)
  );
  const inPrepare = simnet.callReadOnlyFn("sim-pox-5", "is-in-prepare-phase", [Cl.uint(cycle)], platform).result;
  const flag =
    typeof inPrepare === "boolean"
      ? inPrepare
      : inPrepare && typeof inPrepare === "object" && "type" in inPrepare
        ? (inPrepare as { type: number }).type === ClarityType.BoolTrue
        : Boolean((inPrepare as { value?: unknown })?.value);
  if (!flag) return;
  const nextStart = (cycle + 1) * CYCLE_LENGTH;
  const gap = nextStart - simnet.burnBlockHeight + 1;
  if (gap > 0) simnet.mineEmptyBurnBlocks(gap);
}

export function mineUntilBurnHeight(
  platform: string,
  targetExclusive: number,
  thresholdStakers: string[] = []
): void {
  while (simnet.burnBlockHeight <= targetExclusive) {
    const remaining = targetExclusive - simnet.burnBlockHeight + 1;
    const step = Math.max(1, Math.min(DIST_CYCLE_LENGTH, remaining));
    simnet.mineEmptyBurnBlocks(step);
    if (thresholdStakers.length) ensureThresholdStake(platform, thresholdStakers);
    runWeeklyPayout(platform);
  }
}

export type PoxWindows = {
  cycle: number;
  start: number;
  joinEnd: number;
  prepareStart: number;
  cycleEnd: number;
  rewardRelease: number;
};

export function poxWindows(cycle: number): PoxWindows {
  const cycleEnd = (cycle + 1) * CYCLE_LENGTH;
  return {
    cycle,
    start: cycle * CYCLE_LENGTH,
    joinEnd: cycleEnd - PREPARE_LENGTH - 300,
    prepareStart: cycleEnd - PREPARE_LENGTH,
    cycleEnd,
    rewardRelease: cycleEnd + CYCLE_LENGTH + REWARD_RELEASE_OFFSET,
  };
}

export function potPoolConfig(potId: string, sender: string): { joinEnd: number; rewardRelease: number } {
  const cfg = simnet.callReadOnlyFn(potId, "get-pool-config", [], sender);
  const data = tupleFromCv(cfg.result);
  return {
    joinEnd: Number(uintFromCv(data["join-end"])),
    rewardRelease: Number(uintFromCv(data["reward-release"])),
  };
}

export function potRewardRelease(potId: string, sender: string): number {
  return potPoolConfig(potId, sender).rewardRelease;
}

/**
 * Land in a join window with at least `minRemaining` burn blocks before join-end
 * so fill + start can finish before the window closes.
 */
export function ensureJoinWindow(
  platform: string,
  thresholdStakers: string[] = [],
  minRemaining = 1
): PoxWindows {
  let cycle = currentPoxCycle(platform);
  let windows = poxWindows(cycle);
  if (windows.joinEnd - simnet.burnBlockHeight < minRemaining) {
    mineUntilBurnHeight(platform, windows.cycleEnd, thresholdStakers);
    cycle = currentPoxCycle(platform);
    windows = poxWindows(cycle);
  }
  if (windows.joinEnd - simnet.burnBlockHeight < minRemaining) {
    throw new Error(
      `burn ${simnet.burnBlockHeight} needs ${minRemaining} blocks before join-end ${windows.joinEnd} for cycle ${cycle}`
    );
  }
  return windows;
}

export { THRESHOLD_STAKE_USTX, CYCLE_LENGTH, PREPARE_LENGTH, REWARD_RELEASE_OFFSET };
