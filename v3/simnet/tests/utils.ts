import { expect } from "vitest";

export const expectSbtcTransferEvent = (
  event: any,
  expectedAmount: number,
  expectedSender: string,
  expectedRecipient: string
) => {
  expect(event).toStrictEqual({
    event: "ft_transfer_event",
    data: {
      sender: expectedSender,
      amount: expectedAmount.toString(),
      recipient: expectedRecipient,
      asset_identifier:
        "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.sbtc-token::sbtc-token",
    },
  });
};

export const expectStxTransferEvent = (
  event: any,
  expectedAmount: number,
  expectedSender: string,
  expectedRecipient: string,
  memo: string
) => {
  expect(event).toStrictEqual({
    event: "stx_transfer_event",
    data: {
      sender: expectedSender,
      amount: expectedAmount.toString(),
      recipient: expectedRecipient,
      memo,
    },
  });
};
