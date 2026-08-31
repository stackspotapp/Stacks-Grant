import ExcelJS from "exceljs";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

export type TxRow = {
  month: number;
  cycle: number;
  tier: string;
  pot: string;
  functionName: string;
  txArgs: string;
  sender: string;
  stacksBlock: number;
  burnBlock: number;
  potStxBefore: string;
  potBtcBefore: string;
  result: string;
};

export async function writeAccelerationWorkbook(rows: TxRow[], outPath: string): Promise<string> {
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "StacksPot Acceleration Proposal";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Transactions");
  sheet.columns = [
    { header: "Tx #", key: "txNum", width: 8 },
    { header: "Month", key: "month", width: 10 },
    { header: "Cycle", key: "cycle", width: 10 },
    { header: "Tier", key: "tier", width: 8 },
    { header: "Pot", key: "pot", width: 14 },
    { header: "Function", key: "functionName", width: 32 },
    { header: "Tx args", key: "txArgs", width: 72 },
    { header: "Sender", key: "sender", width: 42 },
    { header: "Stacks block", key: "stacksBlock", width: 14 },
    { header: "Burn block", key: "burnBlock", width: 12 },
    { header: "Pot STX before", key: "potStxBefore", width: 18 },
    { header: "Pot BTC before", key: "potBtcBefore", width: 18 },
    { header: "Result", key: "result", width: 12 },
  ];
  rows.forEach((row, i) => {
    sheet.addRow({ txNum: i + 1, ...row });
  });
  styleHeader(sheet);

  await workbook.xlsx.writeFile(outPath);
  return outPath;
}

function styleHeader(sheet: ExcelJS.Worksheet) {
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1F4E79" },
  };
  header.alignment = { vertical: "middle" };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.columnCount },
  };
}
