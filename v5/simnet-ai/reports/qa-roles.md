# Test roles

| Role | Address |
| --- | --- |
| platform (deployer) | ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM |
| pot-a deployer (wallet_1) | ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5 |
| pot-b deployer (wallet_2) | ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG |
| pot-c deployer (wallet_3) | ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC |
| participant wallet_4 (also starter) | ST2NEB84ASENDXKYGJPQW86YXQCEFEX2ZQPG87ND |
| participant wallet_5 (also pot sponsor) | ST2REHHS5J3CERCRBEPMGH7921Q6PYKAADT7JP2VB |
| participant wallet_6 | ST3AM1A56AK2C1XAFJ4115ZSV26EB49BVQ10MGCS0 |
| participant wallet_8 (also unauthorized) | ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP |
| participant wallet_7 | ST3PF13W7Z0RRM42A8VZRVFQ75SV1K26RXEP8YGKJ |
| participant faucet (also closer) | STNHKEPYEPJ8ET55ZZ0M5A34J0R3N5FM2CMMMAZ6 |
| fastpool | ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.fastpool |

## Pots and stake cycles

| Pot | Kind | Deployer | Contract | Stake cycles |
| --- | --- | --- | --- | ---: |
| pot-a | jackpot | ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5 | `ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.pot-a` | 1 |
| pot-b | sequential | ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG | `ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG.pot-b` | 6 (7 claim rounds) |
| pot-c | crowd-fund | ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC | `ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC.pot-c` | 1 |

## PoX cycles

| Item | Value |
| --- | --- |
| PoX cycle length | 2100 burn blocks |
| At role snapshot | cycle=0 burn=3 (burns 0–2099) stacks=3 |
| Platform → Fastpool transfer | 2,000,000 STX |
| Platform sponsor-platform cycles | 10 |
