# StacksPot e2e (PoX claim-rewards before pot close) STX / sBTC balances

STX is microSTX. sBTC is sats. `changed` rows are the only accounts that moved on that transaction.

## Final balances

| account | stx | sbtc |
| --- | --- | --- |
| deployer | 99995000000000 | 0 |
| potDeployer | 99999999700000 | 2631 |
| lp_wallet7 | 99000000000000 | 0 |
| funding_wallet8 | 100000000000000 | 7528 |
| fastpool | 1000000000000 | 50466059 |
| simPox5 | 0 | 39000003 |
| genesisSponsor | 0 | 0 |
| sponsor1 | 0 | 250474 |
| sponsor2 | 0 | 250774 |
| sponsor3 | 5000000000 | 0 |
| jackpot | 0 | 0 |
| sequential | 0 | 0 |
| crowdfund | 0 | 0 |
| joiner1 | 100000000000000 | 4894 |
| joiner2 | 100000000000000 | 4622 |
| joiner3 | 100000000000000 | 12690 |
| joiner4 | 100000000000000 | 0 |
| joiner5 | 100000000000000 | 0 |


## Changes by transaction

| tx | title | status | account | stx_before | stx_after | stx_delta | sbtc_before | sbtc_after | sbtc_delta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 3 | Fund Fastpool threshold stake | SUCCESS | lp | 100000000000000 | 99000000000000 | -1000000000000 | 0 | 0 | 0 |
| 3 | Fund Fastpool threshold stake | SUCCESS | fastpool | 0 | 1000000000000 | 1000000000000 | 0 | 0 | 0 |
| 7 | Initialize Sponsor 1 platform | SUCCESS | deployer | 100000000000000 | 99995000000000 | -5000000000 | 0 | 0 | 0 |
| 7 | Initialize Sponsor 1 platform | SUCCESS | sponsor1 | 0 | 5000000000 | 5000000000 | 0 | 0 | 0 |
| 11 | Initialize Sponsor 2 platform | SUCCESS | deployer | 99995000000000 | 99990000000000 | -5000000000 | 0 | 0 | 0 |
| 11 | Initialize Sponsor 2 platform | SUCCESS | sponsor2 | 0 | 5000000000 | 5000000000 | 0 | 0 | 0 |
| 15 | Initialize Sponsor 3 platform | SUCCESS | deployer | 99990000000000 | 99985000000000 | -5000000000 | 0 | 0 | 0 |
| 15 | Initialize Sponsor 3 platform | SUCCESS | sponsor3 | 0 | 5000000000 | 5000000000 | 0 | 0 | 0 |
| 23 | Initialize jackpot | SUCCESS | potDeployer | 100000000000000 | 99999999900000 | -100000 | 0 | 0 | 0 |
| 24 | Initialize sequential | SUCCESS | potDeployer | 99999999900000 | 99999999800000 | -100000 | 0 | 0 | 0 |
| 25 | Initialize crowdfund | SUCCESS | potDeployer | 99999999800000 | 99999999700000 | -100000 | 0 | 0 | 0 |
| 26 | Jackpot join participant 1 | SUCCESS | joiner1 | 100000000000000 | 99999900000000 | -100000000 | 0 | 0 | 0 |
| 26 | Jackpot join participant 1 | SUCCESS | jackpot | 0 | 100000000 | 100000000 | 0 | 0 | 0 |
| 27 | Jackpot join participant 2 | SUCCESS | joiner2 | 100000000000000 | 99999900000000 | -100000000 | 0 | 0 | 0 |
| 27 | Jackpot join participant 2 | SUCCESS | jackpot | 100000000 | 200000000 | 100000000 | 0 | 0 | 0 |
| 28 | Jackpot join participant 3 | SUCCESS | joiner3 | 100000000000000 | 99999900000000 | -100000000 | 0 | 0 | 0 |
| 28 | Jackpot join participant 3 | SUCCESS | jackpot | 200000000 | 300000000 | 100000000 | 0 | 0 | 0 |
| 29 | Jackpot join participant 4 | SUCCESS | joiner4 | 100000000000000 | 99999900000000 | -100000000 | 0 | 0 | 0 |
| 29 | Jackpot join participant 4 | SUCCESS | jackpot | 300000000 | 400000000 | 100000000 | 0 | 0 | 0 |
| 30 | Jackpot join participant 5 | SUCCESS | joiner5 | 100000000000000 | 99999900000000 | -100000000 | 0 | 0 | 0 |
| 30 | Jackpot join participant 5 | SUCCESS | jackpot | 400000000 | 500000000 | 100000000 | 0 | 0 | 0 |
| 31 | Sequential join participant 1 | SUCCESS | joiner1 | 99999900000000 | 99999800000000 | -100000000 | 0 | 0 | 0 |
| 31 | Sequential join participant 1 | SUCCESS | sequential | 0 | 100000000 | 100000000 | 0 | 0 | 0 |
| 32 | Sequential join participant 2 | SUCCESS | joiner2 | 99999900000000 | 99999800000000 | -100000000 | 0 | 0 | 0 |
| 32 | Sequential join participant 2 | SUCCESS | sequential | 100000000 | 200000000 | 100000000 | 0 | 0 | 0 |
| 33 | Sequential join participant 3 | SUCCESS | joiner3 | 99999900000000 | 99999800000000 | -100000000 | 0 | 0 | 0 |
| 33 | Sequential join participant 3 | SUCCESS | sequential | 200000000 | 300000000 | 100000000 | 0 | 0 | 0 |
| 34 | Crowdfund join participant 1 | SUCCESS | joiner1 | 99999800000000 | 99999700000000 | -100000000 | 0 | 0 | 0 |
| 34 | Crowdfund join participant 1 | SUCCESS | crowdfund | 0 | 100000000 | 100000000 | 0 | 0 | 0 |
| 35 | Crowdfund join participant 2 | SUCCESS | joiner2 | 99999800000000 | 99999700000000 | -100000000 | 0 | 0 | 0 |
| 35 | Crowdfund join participant 2 | SUCCESS | crowdfund | 100000000 | 200000000 | 100000000 | 0 | 0 | 0 |
| 36 | Crowdfund join participant 3 | SUCCESS | joiner3 | 99999800000000 | 99999700000000 | -100000000 | 0 | 0 | 0 |
| 36 | Crowdfund join participant 3 | SUCCESS | crowdfund | 200000000 | 300000000 | 100000000 | 0 | 0 | 0 |
| 37 | Crowdfund join participant 4 | SUCCESS | joiner4 | 99999900000000 | 99999800000000 | -100000000 | 0 | 0 | 0 |
| 37 | Crowdfund join participant 4 | SUCCESS | crowdfund | 300000000 | 400000000 | 100000000 | 0 | 0 | 0 |
| 38 | Crowdfund join participant 5 | SUCCESS | joiner5 | 99999900000000 | 99999800000000 | -100000000 | 0 | 0 | 0 |
| 38 | Crowdfund join participant 5 | SUCCESS | crowdfund | 400000000 | 500000000 | 100000000 | 0 | 0 | 0 |
| 43 | Mine to end of PoX cycle 1 (step 1, +1050 blocks) | SUCCESS | simPox5 | 0 | 0 | 0 | 0 | 10000000 | 10000000 |
| 45 | Mine to end of PoX cycle 1 (step 2, +1050 blocks) | SUCCESS | simPox5 | 0 | 0 | 0 | 10000000 | 20000000 | 10000000 |
| 47 | Mine to end of PoX cycle 1 (step 3, +1050 blocks) | SUCCESS | simPox5 | 0 | 0 | 0 | 20000000 | 30000000 | 10000000 |
| 49 | Mine to end of PoX cycle 1 (step 4, +1047 blocks) | SUCCESS | simPox5 | 0 | 0 | 0 | 30000000 | 40000000 | 10000000 |
| 51 | sim-pox-5 claim-rewards cycle 1 before sequential claim 1 | SUCCESS | fastpool | 1000000000000 | 1000000000000 | 0 | 0 | 16999999 | 16999999 |
| 51 | sim-pox-5 claim-rewards cycle 1 before sequential claim 1 | SUCCESS | simPox5 | 0 | 0 | 0 | 40000000 | 23000001 | -16999999 |
| 52 | Sequential Claim 1 | SUCCESS | deployer | 99985000000000 | 99990000000000 | 5000000000 | 0 | 0 | 0 |
| 52 | Sequential Claim 1 | SUCCESS | potDeployer | 99999999700000 | 99999999700000 | 0 | 0 | 371 | 371 |
| 52 | Sequential Claim 1 | SUCCESS | fastpool | 1000000000000 | 1000000000000 | 0 | 16999999 | 16911345 | -88654 |
| 52 | Sequential Claim 1 | SUCCESS | joiner1 | 99999700000000 | 99999800000000 | 100000000 | 0 | 4894 | 4894 |
| 52 | Sequential Claim 1 | SUCCESS | joiner2 | 99999700000000 | 99999800000000 | 100000000 | 0 | 0 | 0 |
| 52 | Sequential Claim 1 | SUCCESS | joiner3 | 99999700000000 | 99999800000000 | 100000000 | 0 | 0 | 0 |
| 52 | Sequential Claim 1 | SUCCESS | sponsor1 | 5000000000 | 0 | -5000000000 | 0 | 83336 | 83336 |
| 52 | Sequential Claim 1 | SUCCESS | sequential | 300000000 | 0 | -300000000 | 0 | 0 | 0 |
| 54 | Mine to end of PoX cycle 2 (step 1, +1050 blocks) | SUCCESS | simPox5 | 0 | 0 | 0 | 23000001 | 33000001 | 10000000 |
| 56 | Mine to end of PoX cycle 2 (step 2, +1050 blocks) | SUCCESS | simPox5 | 0 | 0 | 0 | 33000001 | 43000001 | 10000000 |
| 58 | sim-pox-5 claim-rewards cycle 2 before sequential claim 2 | SUCCESS | fastpool | 1000000000000 | 1000000000000 | 0 | 16911345 | 33911344 | 16999999 |
| 58 | sim-pox-5 claim-rewards cycle 2 before sequential claim 2 | SUCCESS | simPox5 | 0 | 0 | 0 | 43000001 | 26000002 | -16999999 |
| 59 | Sequential Claim 2 | SUCCESS | potDeployer | 99999999700000 | 99999999700000 | 0 | 371 | 722 | 351 |
| 59 | Sequential Claim 2 | SUCCESS | fastpool | 1000000000000 | 1000000000000 | 0 | 33911344 | 33822602 | -88742 |
| 59 | Sequential Claim 2 | SUCCESS | joiner2 | 99999800000000 | 99999800000000 | 0 | 0 | 4622 | 4622 |
| 59 | Sequential Claim 2 | SUCCESS | sponsor1 | 0 | 0 | 0 | 83336 | 167055 | 83719 |
| 61 | Mine to end of PoX cycle 3 (step 1, +1050 blocks) | SUCCESS | simPox5 | 0 | 0 | 0 | 26000002 | 36000002 | 10000000 |
| 63 | Mine to end of PoX cycle 3 (step 2, +1050 blocks) | SUCCESS | simPox5 | 0 | 0 | 0 | 36000002 | 46000002 | 10000000 |
| 65 | sim-pox-5 claim-rewards cycle 3 before sequential claim 3 | SUCCESS | fastpool | 1000000000000 | 1000000000000 | 0 | 33822602 | 50822601 | 16999999 |
| 65 | sim-pox-5 claim-rewards cycle 3 before sequential claim 3 | SUCCESS | simPox5 | 0 | 0 | 0 | 46000002 | 29000003 | -16999999 |
| 66 | Sequential Claim 3 | SUCCESS | potDeployer | 99999999700000 | 99999999700000 | 0 | 722 | 1073 | 351 |
| 66 | Sequential Claim 3 | SUCCESS | fastpool | 1000000000000 | 1000000000000 | 0 | 50822601 | 50733859 | -88742 |
| 66 | Sequential Claim 3 | SUCCESS | joiner3 | 99999800000000 | 99999800000000 | 0 | 0 | 4622 | 4622 |
| 66 | Sequential Claim 3 | SUCCESS | sponsor1 | 0 | 0 | 0 | 167055 | 250774 | 83719 |
| 68 | Mine to sequential STX unlock / reward-release (step 1, +433 blocks) | SUCCESS | simPox5 | 0 | 0 | 0 | 29000003 | 39000003 | 10000000 |
| 71 | Jackpot claim | SUCCESS | deployer | 99990000000000 | 99995000000000 | 5000000000 | 0 | 0 | 0 |
| 71 | Jackpot claim | SUCCESS | potDeployer | 99999999700000 | 99999999700000 | 0 | 1073 | 1879 | 806 |
| 71 | Jackpot claim | SUCCESS | fastpool | 1000000000000 | 1000000000000 | 0 | 50733859 | 50474422 | -259437 |
| 71 | Jackpot claim | SUCCESS | joiner1 | 99999800000000 | 99999900000000 | 100000000 | 4894 | 4894 | 0 |
| 71 | Jackpot claim | SUCCESS | joiner2 | 99999800000000 | 99999900000000 | 100000000 | 4622 | 4622 | 0 |
| 71 | Jackpot claim | SUCCESS | joiner3 | 99999800000000 | 99999900000000 | 100000000 | 4622 | 12690 | 8068 |
| 71 | Jackpot claim | SUCCESS | joiner4 | 99999800000000 | 99999900000000 | 100000000 | 0 | 0 | 0 |
| 71 | Jackpot claim | SUCCESS | joiner5 | 99999800000000 | 99999900000000 | 100000000 | 0 | 0 | 0 |
| 71 | Jackpot claim | SUCCESS | sponsor1 | 0 | 0 | 0 | 250774 | 250474 | -300 |
| 71 | Jackpot claim | SUCCESS | sponsor2 | 5000000000 | 0 | -5000000000 | 0 | 250774 | 250774 |
| 71 | Jackpot claim | SUCCESS | jackpot | 500000000 | 0 | -500000000 | 0 | 0 | 0 |
| 73 | Crowdfund claim | SUCCESS | potDeployer | 99999999700000 | 99999999700000 | 0 | 1879 | 2631 | 752 |
| 73 | Crowdfund claim | SUCCESS | funding | 100000000000000 | 100000000000000 | 0 | 0 | 7528 | 7528 |
| 73 | Crowdfund claim | SUCCESS | fastpool | 1000000000000 | 1000000000000 | 0 | 50474422 | 50466059 | -8363 |
| 73 | Crowdfund claim | SUCCESS | joiner1 | 99999900000000 | 100000000000000 | 100000000 | 4894 | 4894 | 0 |
| 73 | Crowdfund claim | SUCCESS | joiner2 | 99999900000000 | 100000000000000 | 100000000 | 4622 | 4622 | 0 |
| 73 | Crowdfund claim | SUCCESS | joiner3 | 99999900000000 | 100000000000000 | 100000000 | 12690 | 12690 | 0 |
| 73 | Crowdfund claim | SUCCESS | joiner4 | 99999900000000 | 100000000000000 | 100000000 | 0 | 0 | 0 |
| 73 | Crowdfund claim | SUCCESS | joiner5 | 99999900000000 | 100000000000000 | 100000000 | 0 | 0 | 0 |
| 73 | Crowdfund claim | SUCCESS | crowdfund | 500000000 | 0 | -500000000 | 0 | 0 | 0 |
