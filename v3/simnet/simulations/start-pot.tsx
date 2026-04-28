import { SimulationBuilder } from "stxer";
import { Cl } from "@stacks/transactions";

const ADMIN = "SP32XNV169ER2N5NJPJ7REG1RBFA3YJ2XEG0236HX";
const SENDER = "SPN4Y5QPGQA8882ZXW90ADC2DHYXMSTN8VAR8C3X";
const JACKPOT_CONTRACT =
  "SPN4Y5QPGQA8882ZXW90ADC2DHYXMSTN8VAR8C3X.stackspot-jackpot-v00";
const AUDITED_CONTRACT =
  "SP32XNV169ER2N5NJPJ7REG1RBFA3YJ2XEG0236HX.stackspot-audited-contracts";
const POOL_CONTRACT =
  "SPMPMA1V6P430M8C91QS1G9XJ95S59JS1TZFZ4Q4.pox4-multi-pool-v1";

const simulationId = await SimulationBuilder.new({
  network: "mainnet",
})
  .useBlockHeight(5400060)
  .withSender(ADMIN)
  .addContractCall({
    contract_id: AUDITED_CONTRACT,
    function_name: "update-audited-contract",
    function_args: [Cl.principal(JACKPOT_CONTRACT), Cl.bool(true)],
  })
  .withSender(SENDER)
  .addContractCall({
    contract_id: JACKPOT_CONTRACT,
    function_name: "start-stackspot-jackpot",
    function_args: [Cl.principal(JACKPOT_CONTRACT)],
  })
  // run this after half the cycle is over
  // .addContractCall({
  //   contract_id: POOL_CONTRACT,
  //   function_name: "delegate-stack-stx",
  //   function_args: [Cl.principal(JACKPOT_CONTRACT)],
  // })
  .run();

// View simulation results at: https://stxer.xyz/simulations/{network}/{simulationId}
