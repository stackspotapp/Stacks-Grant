#!/usr/bin/env python3
"""Rewrite testnet-ai contracts to a new testnet deployer principal."""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACTS = ROOT / "contracts"
PUBLISHED = ROOT / "published"

SBTC_DEPLOYER = "SN3VMHXEN64ZZF71JQ5VESXDWTR301XTTXGF4J8F1"
SIGNER_DEPLOYER = "ST31XHNM0GZ2K978FPP4QA3STNQ73Z8C9G9MJEPK2"


def rewrite(text: str, old: str, new: str) -> str:
    # Keep on-chain sBTC + signer-manager pinned; only rewrite Stackspots principals.
    text = text.replace(SBTC_DEPLOYER, "\x00SBTC_DEPLOYER\x00")
    text = text.replace(SIGNER_DEPLOYER, "\x00SIGNER_DEPLOYER\x00")
    text = text.replace(old, new)
    return (
        text.replace("\x00SBTC_DEPLOYER\x00", SBTC_DEPLOYER).replace(
            "\x00SIGNER_DEPLOYER\x00", SIGNER_DEPLOYER
        )
    )


def main() -> None:
    if len(sys.argv) != 3:
        print("usage: qualify-for-deployer.py <OLD_DEPLOYER> <NEW_DEPLOYER>", file=sys.stderr)
        sys.exit(1)
    old, new = sys.argv[1], sys.argv[2]
    if not old.startswith("ST") or not new.startswith("ST"):
        print("deployers must be testnet principals (ST…)", file=sys.stderr)
        sys.exit(1)
    for folder in (CONTRACTS, PUBLISHED):
        for path in sorted(folder.glob("*.clar")):
            path.write_text(rewrite(path.read_text(encoding="utf-8"), old, new), encoding="utf-8")
            print(path.relative_to(ROOT))


if __name__ == "__main__":
    main()
