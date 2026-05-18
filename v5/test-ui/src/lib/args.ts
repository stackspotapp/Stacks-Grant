import { Cl, type ClarityValue } from "@stacks/transactions";
import {
  classifyAbiType,
  formatAbiType,
  getOptionalInnerType,
} from "./abiTypes";
import { DEPLOYER_ADDRESS } from "../config/network";
import { POOL_POX_TUPLE } from "../config/contracts";
import type { RegisteredPot } from "./events";
import { potTraitClarity } from "./potDetails";

export function uintArg(value: string | number): ClarityValue {
  const n = typeof value === "string" ? BigInt(value) : BigInt(value);
  return Cl.uint(n);
}

export function principalArg(value: string): ClarityValue {
  const parsed = value.match(/^(ST[A-Z0-9]+)\.([a-z][a-z0-9-]+)$/);
  if (parsed) {
    return Cl.contractPrincipal(parsed[1]!, parsed[2]!);
  }
  return Cl.principal(value);
}

export function boolArg(value: boolean): ClarityValue {
  return Cl.bool(value);
}

export function bufferArg(raw: string): ClarityValue {
  const hex = raw.startsWith("0x") ? raw.slice(2) : raw;
  return Cl.bufferFromHex(hex);
}

export function poolPoxAddressTuple(): ClarityValue {
  return Cl.tuple({
    version: Cl.bufferFromHex(POOL_POX_TUPLE.version.replace("0x", "")),
    hashbytes: Cl.bufferFromHex(POOL_POX_TUPLE.hashbytes.replace("0x", "")),
  });
}

export function parseArgInput(
  type: unknown,
  raw: string,
  context?: { pot?: RegisteredPot },
): ClarityValue {
  const trimmed = raw.trim();
  const kind = classifyAbiType(type);

  switch (kind) {
    case "uint":
    case "int":
      return uintArg(trimmed);
    case "bool":
      return boolArg(trimmed === "true");
    case "principal":
    case "trait": {
      if (trimmed === "pot-trait" && context?.pot) {
        return potTraitClarity(context.pot);
      }
      if (trimmed.startsWith(".")) {
        const name = trimmed.slice(1);
        return Cl.contractPrincipal(DEPLOYER_ADDRESS, name);
      }
      return principalArg(trimmed);
    }
    case "buffer":
      return bufferArg(trimmed);
    case "string-ascii":
      return Cl.stringAscii(trimmed);
    case "string-utf8":
      return Cl.stringUtf8(trimmed);
    case "optional": {
      if (!trimmed || trimmed === "none") return Cl.none();
      return Cl.some(parseArgInput(getOptionalInnerType(type), trimmed, context));
    }
    case "tuple":
      if (trimmed.startsWith("{")) {
        throw new Error(
          "Tuple args: paste JSON in advanced mode or use preset buttons on Core",
        );
      }
      break;
    case "list":
      throw new Error("List args are not supported in the form UI yet");
    default:
      break;
  }

  throw new Error(`Unsupported arg type: ${formatAbiType(type)}`);
}

/** register-pot tuple builder */
export function registerPotArgs(input: {
  owner: string;
  contract: string;
  cycles: string;
  type: string;
  potRewardToken: string;
  minAmount: string;
  maxParticipants: string;
}): ClarityValue[] {
  return [
    Cl.tuple({
      owner: principalArg(input.owner),
      contract: principalArg(input.contract),
      cycles: uintArg(input.cycles),
      type: Cl.stringAscii(input.type),
      "pot-reward-token": Cl.stringAscii(input.potRewardToken),
      "min-amount": uintArg(input.minAmount),
      "max-participants": uintArg(input.maxParticipants),
    }),
  ];
}
