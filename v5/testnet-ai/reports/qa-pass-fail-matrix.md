# Pass / fail matrix

| ID | Suite | Title | Contract | PoX cycle | Burn | Cycle burns | Expected | Actual | Pass | Notes |
| --- | --- | --- | --- | ---: | ---: | --- | --- | --- | --- | --- |
| BOOT-01 | activation | Boot sBTC / PoX-5 / Fastpool | sim-pox-5 | 0 | 3 | 0–2099 | ok | ok | PASS |  |
| BOOT-02 | activation | transfer 2,000,000 STX from platform to fastpool and stake for signer threshold | ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.fastpool | 0 | 3 | 0–2099 | 2000000000000 uSTX | 2000000000000 | PASS | fastpool liquid STX 2000000.000000 |
| ADM-01 | admin | init-admin after genesis top-level activation (should already be initialized) | init-admin | 0 | 3 | 0–2099 | err u1413 | ok | FAIL | spec: deploy-time (update-contract-hash) must set initialized |
| ADM-01b | admin | init-admin second public call | init-admin | 0 | 3 | 0–2099 | err u1413 | err u1413 | PASS |  |
| ADM-02 | admin | init-admin from unauthorized wallet | init-admin | 0 | 3 | 0–2099 | err u1101 | err u1101 | PASS |  |
| ADM-03 | admin | add-update-admin-status from admin | stackspots | 0 | 3 | 0–2099 | ok | ok | PASS | state logging via print + sec mint/burn |
| ADM-04 | admin | add-update-admin-status from unauthorized | stackspots | 0 | 3 | 0–2099 | err u1101 | err u1101 | PASS |  |
| ADM-05 | admin | update-public-pot-deploy-status from admin | stackspots | 0 | 3 | 0–2099 | ok | ok | PASS |  |
| ADM-06 | admin | update-fee from non-treasury | stackspots | 0 | 3 | 0–2099 | err u1102 | err u1102 | PASS |  |
| ADM-07 | admin | set-pot-contract-hash from unauthorized | stackspots | 0 | 3 | 0–2099 | err u1101 | err u1101 | PASS |  |
| ADM-08 | admin | log-pre-init from EOA (unauthorized contract hash) | stackspots | 0 | 3 | 0–2099 | err u1110 | err u1110 | PASS |  |
| ADM-09 | admin | log-sponsor-platform from non-sponsor | stackspots | 0 | 3 | 0–2099 | err u1110 | err u1110 | PASS |  |
| ADM-10 | admin | pot-a deployer is now admin after ADM-03 | stackspots | 0 | 3 | 0–2099 | true | {"type":"true"} | PASS | post-activation state |
| DEP-01 | deploy | incorrect dependencies (unqualified .stackspots on wallet publisher) | ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.qa-bad-deps | 0 | 3 | 0–2099 | err | throw: "Contract deployment runtime error: ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.qa-bad-deps -> use of unresolved contract 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.sim-pox-5'" | PASS | publisher.stackspots does not exist |
| DEP-02 | deploy | unauthorized deploy still calling log-pre-init | ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.qa-bad-preinit | 0 | 3 | 0–2099 | err | err u1110 | PASS | copy hash is not allowlisted at deploy-time log-pre-init |
| DEP-03 | deploy | pot-a jackpot copy (wallet_1) | ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.pot-a | 0 | 3 | 0–2099 | ok | {"type":"buffer","value":"0c0000000c056576656e740d000000087072652d696e69740f66756e64696e672d616464726573730909706f742d61646d696e051a7321b74e2b6a7e949e6c4ad313035b16650950170c706f742d636f6e7472616374061a7321b74e2b6a7e949e6c4ad313035b166509501705706f742d6109706f742d6379636c6501000000000000000000000000000000010b706f742d69732d696e69740414706f742d6d61782d7061727469636970616e747301000000000000000000000000000000640e706f742d6d696e2d616d6f756e740100000000000000000000000005f5e10008706f742d6e616d650d0000000009706f742d6f776e6572051a7321b74e2b6a7e949e6c4ad313035b16650950170c706f742d7472656173757279061a7321b74e2b6a7e949e6c4ad313035b166509501705706f742d6108706f742d747970650d000000076a61636b706f74"} | PASS |  |
| DEP-04 | deploy | pot-b sequential copy (wallet_2) | ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG.pot-b | 0 | 3 | 0–2099 | ok | {"type":"buffer","value":"0c0000000c056576656e740d000000087072652d696e69740f66756e64696e672d616464726573730909706f742d61646d696e051a99e2ec69ac5b6e67b4e26edd0e2c1c1a6b9bbd230c706f742d636f6e7472616374061a99e2ec69ac5b6e67b4e26edd0e2c1c1a6b9bbd2305706f742d6209706f742d6379636c6501000000000000000000000000000000010b706f742d69732d696e69740414706f742d6d61782d7061727469636970616e747301000000000000000000000000000000640e706f742d6d696e2d616d6f756e740100000000000000000000000005f5e10008706f742d6e616d650d0000000009706f742d6f776e6572051a99e2ec69ac5b6e67b4e26edd0e2c1c1a6b9bbd230c706f742d7472656173757279061a99e2ec69ac5b6e67b4e26edd0e2c1c1a6b9bbd2305706f742d6208706f742d747970650d0000000a73657175656e7469616c"} | PASS |  |
| DEP-05 | deploy | pot-c crowd-fund copy (wallet_3) | ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC.pot-c | 0 | 3 | 0–2099 | ok | {"type":"buffer","value":"0c0000000c056576656e740d000000087072652d696e69740f66756e64696e672d616464726573730a051aa5180cc1ff6050df53f0ab766d76b630e14feb0c09706f742d61646d696e051aa5180cc1ff6050df53f0ab766d76b630e14feb0c0c706f742d636f6e7472616374061aa5180cc1ff6050df53f0ab766d76b630e14feb0c05706f742d6309706f742d6379636c6501000000000000000000000000000000010b706f742d69732d696e69740414706f742d6d61782d7061727469636970616e747301000000000000000000000000000000640e706f742d6d696e2d616d6f756e740100000000000000000000000005f5e10008706f742d6e616d650d0000000009706f742d6f776e6572051aa5180cc1ff6050df53f0ab766d76b630e14feb0c0c706f742d7472656173757279061aa5180cc1ff6050df53f0ab766d76b630e14feb0c05706f742d6308706f742d747970650d0000000a63726f77642d66756e64"} | PASS |  |
| DEP-06 | deploy | platform admin allowlists pot-a contract hash | stackspots | 0 | 3 | 0–2099 | ok | ok | PASS |  |
| DEP-07 | deploy | platform admin allowlists pot-b contract hash | stackspots | 0 | 3 | 0–2099 | ok | ok | PASS |  |
| DEP-08 | deploy | platform admin allowlists pot-c contract hash | stackspots | 0 | 3 | 0–2099 | ok | ok | PASS |  |
| DEP-09 | deploy | genesis jackpot init from treasury deployer | jackpot | 0 | 3 | 0–2099 | err u1101 | err u1101 | PASS | tx-sender == platform-treasury cannot mint pot NFT |
| INI-01 | init | init-pot wrong self trait | ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.pot-a | 0 | 3 | 0–2099 | err u1101 | err u1101 | PASS |  |
| INI-02 | init | init-pot from unauthorized (not POT_ADMIN) | ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.pot-a | 0 | 3 | 0–2099 | err u1102 | err u1102 | PASS |  |
| INI-03 | init | init-pot duplicate platform sponsors | ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.pot-a | 0 | 3 | 0–2099 | err u1105 | err u1105 | PASS |  |
| INI-04 | init | init-pot invalid sponsor trait (stackspots) | ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.pot-a | 0 | 3 | 0–2099 | err | err u"Call contract function error: ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.pot-a::init-pot(u1, u1000000, u6, \"neg-bad-trait\", 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.pot-a, (list 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.stackspots)) -> Error calling contract function 'init-pot': Runtime error while interpreting ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.pot-a: RuntimeCheck(BadTraitImplementation(\"stackspot-sponsor-trait\", \"sponsor-event\"))" | PASS | stackspots does not impl stackspot-sponsor-trait |
| INI-05 | init | sequential init max-participants 0 | ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG.pot-b | 0 | 3 | 0–2099 | err u1202 | err u1202 | PASS |  |
| INI-06 | init | jackpot init max-participants 101 | ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.pot-a | 0 | 3 | 0–2099 | err u1202 | err u1202 | PASS |  |
| INI-07 | init | jackpot init from participant (not POT_ADMIN) | ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.pot-a | 0 | 3 | 0–2099 | err u1102 | err u1102 | PASS |  |
| PSP-01 | sponsor-platform | sponsor-platform below minimum | stackspot-sponsor | 0 | 3 | 0–2099 | err u1301 | err u1301 | PASS |  |
| PSP-02 | sponsor-platform | update-rule-set from unauthorized | stackspot-sponsor | 0 | 3 | 0–2099 | err u1304 | err u1304 | PASS |  |
| PSP-03 | sponsor-platform | sponsor-event from EOA (must be pot contract-caller) | stackspot-sponsor | 0 | 3 | 0–2099 | err u1304 | err u1304 | PASS |  |
| PSP-04 | sponsor-platform | sponsor-platform happy path (10 cycles) | stackspot-sponsor | 0 | 3 | 0–2099 | ok | ok | PASS |  |
| PSP-05 | events | sponsor-platform logs on stackspots | stackspot-sponsor | 0 | 3 | 0–2099 | print | print | PASS | hex sponsor-platform |
| INI-10 | init | pot-a jackpot init with platform sponsor (1 stake cycle) | ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.pot-a | 0 | 3 | 0–2099 | ok | ok | PASS |  |
| INI-08 | init | repeated init on pot-a | ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.pot-a | 0 | 3 | 0–2099 | err u1411 | err u1411 | PASS |  |
| INI-09 | events | init-pot print contains event name | ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.pot-a | 0 | 3 | 0–2099 | print | print | PASS |  |
| INI-11 | init | platform sponsor ticket stored on pot | ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.pot-a | 0 | 3 | 0–2099 | some uint | {"type":"ok","value":{"type":"some","value":{"type":"uint","value":"1"}}} | PASS | {"type":"ok","value":{"type":"some","value":{"type":"uint","value":"1"}}} |
| INI-12 | events | init-pot logs sponsor-contract + ticket-id | ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.pot-a | 0 | 3 | 0–2099 | print | print | PASS |  |
| INI-13 | init | pot-b sequential init empty sponsors (cycle count follows joins) | ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG.pot-b | 0 | 3 | 0–2099 | ok | ok | PASS |  |
| INI-14 | init | pot-c crowd-fund init with funding address (1 stake cycle) | ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC.pot-c | 0 | 3 | 0–2099 | ok | ok | PASS |  |
| ST-01 | start | start pot-a before target (no participants) | ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.pot-a | 0 | 3 | 0–2099 | err u1410 | err u1410 | PASS |  |
| SPN-01 | pot-sponsor | join-pot-as-sponsor amount 0 | ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.pot-a | 0 | 3 | 0–2099 | err u1302 | err u1302 | PASS |  |
| SPN-02 | pot-sponsor | join-pot-as-sponsor as platform treasury | ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.pot-a | 0 | 3 | 0–2099 | err u1101 | err u1101 | PASS |  |
| SPN-03 | pot-sponsor | join-pot-as-sponsor as pot admin | ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.pot-a | 0 | 3 | 0–2099 | err u1101 | err u1101 | PASS |  |
| SPN-04 | pot-sponsor | join-pot-as-sponsor caller != sponsor principal | ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.pot-a | 0 | 3 | 0–2099 | err | err u4 | PASS | stx-transfer-memo? requires tx-sender == sponsor |
| SPN-05 | pot-sponsor | join-pot-as-sponsor happy path | ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.pot-a | 0 | 3 | 0–2099 | ok | ok | PASS |  |
| SPN-06 | pot-sponsor | duplicate join-pot-as-sponsor | ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.pot-a | 0 | 3 | 0–2099 | err u1105 | err u1105 | PASS |  |
| SPN-07 | events | join-pot-as-sponsor print + stackspots log | ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.pot-a | 0 | 3 | 0–2099 | print | print | PASS |  |
| SPN-08 | pot-sponsor | sequential join-pot-as-sponsor | ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG.pot-b | 0 | 3 | 0–2099 | ok | ok | PASS |  |
| SPN-09 | pot-sponsor | crowd-fund join-pot-as-sponsor | ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC.pot-c | 0 | 3 | 0–2099 | ok | ok | PASS |  |
| JN-01 | join | join below minimum | ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.pot-a | 0 | 3 | 0–2099 | err u1302 | err u1302 | PASS |  |
| JN-02 | join | join as pot-a admin | ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.pot-a | 0 | 3 | 0–2099 | err u1101 | err u1101 | PASS |  |
| JN-03 | join | join as platform treasury | ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.pot-a | 0 | 3 | 0–2099 | err u1101 | err u1101 | PASS |  |
| JN-04 | join | wallet_4 joins pot-a at minimum | ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.pot-a | 0 | 3 | 0–2099 | ok | ok | PASS |  |
| JN-05 | join | duplicate join wallet_4 on pot-a | ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.pot-a | 0 | 3 | 0–2099 | err u1104 | err u1104 | PASS |  |
| JN-06 | join | wallet_5 joins pot-a at minimum | ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.pot-a | 0 | 3 | 0–2099 | ok | ok | PASS |  |
| JN-07 | join | wallet_6 joins pot-a at minimum | ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.pot-a | 0 | 3 | 0–2099 | ok | ok | PASS |  |
| JN-08 | join | wallet_8 joins pot-a at minimum | ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.pot-a | 0 | 3 | 0–2099 | ok | ok | PASS |  |
| JN-09 | join | wallet_7 joins pot-a at minimum | ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.pot-a | 0 | 3 | 0–2099 | ok | ok | PASS |  |
| JN-010 | join | faucet joins pot-a at minimum | ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.pot-a | 0 | 3 | 0–2099 | ok | ok | PASS |  |
| JN-10 | events | join-pot print captured | ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.pot-a | 0 | 3 | 0–2099 | print | print | PASS |  |
| JN-B1 | join | wallet_4 joins pot-b | ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG.pot-b | 0 | 3 | 0–2099 | ok | ok | PASS |  |
| JN-C1 | join | wallet_4 joins pot-c | ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC.pot-c | 0 | 3 | 0–2099 | ok | ok | PASS |  |
| JN-B2 | join | wallet_5 joins pot-b | ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG.pot-b | 0 | 3 | 0–2099 | ok | ok | PASS |  |
| JN-C2 | join | wallet_5 joins pot-c | ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC.pot-c | 0 | 3 | 0–2099 | ok | ok | PASS |  |
| JN-B3 | join | wallet_6 joins pot-b | ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG.pot-b | 0 | 3 | 0–2099 | ok | ok | PASS |  |
| JN-C3 | join | wallet_6 joins pot-c | ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC.pot-c | 0 | 3 | 0–2099 | ok | ok | PASS |  |
| JN-B4 | join | wallet_8 joins pot-b | ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG.pot-b | 0 | 3 | 0–2099 | ok | ok | PASS |  |
| JN-C4 | join | wallet_8 joins pot-c | ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC.pot-c | 0 | 3 | 0–2099 | ok | ok | PASS |  |
| JN-B5 | join | wallet_7 joins pot-b | ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG.pot-b | 0 | 3 | 0–2099 | ok | ok | PASS |  |
| JN-C5 | join | wallet_7 joins pot-c | ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC.pot-c | 0 | 3 | 0–2099 | ok | ok | PASS |  |
| JN-B6 | join | faucet joins pot-b | ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG.pot-b | 0 | 3 | 0–2099 | ok | ok | PASS |  |
| JN-C6 | join | faucet joins pot-c | ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC.pot-c | 0 | 3 | 0–2099 | ok | ok | PASS |  |
| JN-13 | join | lifecycle pot value = participants + sponsor principal | ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.pot-a | 0 | 3 | 0–2099 | 8000000 | 8000000 | PASS |  |
| CAN-01 | cancel | cancel-pot too early | ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.pot-a | 0 | 3 | 0–2099 | err u1409 | err u1409 | PASS |  |
| ST-02 | start | start with wrong pot trait | ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.pot-a | 0 | 3 | 0–2099 | err u1101 | err u1101 | PASS |  |
| ST-03 | start | start pot-a jackpot | ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.pot-a | 0 | 3 | 0–2099 | ok | ok | PASS |  |
| ST-04 | start | repeat start | ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.pot-a | 0 | 3 | 0–2099 | err u1403 | err u1403 | PASS |  |
| JN-14 | join | join after start | ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.pot-a | 0 | 3 | 0–2099 | err u1401 | err u1401 | PASS |  |
| ST-05 | events | start-stackspot-jackpot print | ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.pot-a | 0 | 3 | 0–2099 | print | print | PASS |  |
| ST-06 | start | start pot-b sequential | ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG.pot-b | 0 | 3 | 0–2099 | ok | ok | PASS |  |
| ST-07 | start | start pot-c crowdfund | ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC.pot-c | 0 | 3 | 0–2099 | ok | ok | PASS |  |
| CL-01 | claim | claim before reward-release | ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.pot-a | 0 | 3 | 0–2099 | err u1402 | err u1402 | PASS |  |
| CL-02 | claim | claim lifecycle jackpot after reward-release | ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.pot-a | 2 | 4633 | 4200–6299 | ok | ok | PASS |  |
| CL-03 | events | claim-pot-reward print includes yield | ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.pot-a | 2 | 4633 | 4200–6299 | print | print | PASS |  |
| MIX-01 | mixed-funds | sponsor principal STX is returned separately from participant STX | ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.pot-a | 2 | 4633 | 4200–6299 | sponsor ~3000000 (wallet_5 also joined) | 3000000 | PASS | participants returned 8000000 |
| MIX-02 | mixed-funds | yield is sBTC (not STX) after Fastpool pull | sbtc-token | 2 | 4633 | 4200–6299 | yield > 0 or documented | pot sBTC 0 closer 1 starter 63 | PASS | claimer/starter/winner share sBTC; STX principal is refunded |
| SEQ-CL-01 | claim | claim pot-b sequential reward-cycle round 1/7 | ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG.pot-b | 2 | 4633 | 4200–6299 | ok | ok | PASS |  |
| SEQ-CL-EV-01 | events | pot-b sequential claim 1 print | ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG.pot-b | 2 | 4633 | 4200–6299 | print | print | PASS |  |
| SEQ-CL-02 | claim | claim pot-b sequential reward-cycle round 2/7 | ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG.pot-b | 3 | 6733 | 6300–8399 | ok | ok | PASS |  |
| SEQ-CL-EV-02 | events | pot-b sequential claim 2 print | ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG.pot-b | 3 | 6733 | 6300–8399 | print | print | PASS |  |
| SEQ-CL-03 | claim | claim pot-b sequential reward-cycle round 3/7 | ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG.pot-b | 4 | 8833 | 8400–10499 | ok | ok | PASS |  |
| SEQ-CL-EV-03 | events | pot-b sequential claim 3 print | ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG.pot-b | 4 | 8833 | 8400–10499 | print | print | PASS |  |
| SEQ-CL-04 | claim | claim pot-b sequential reward-cycle round 4/7 | ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG.pot-b | 5 | 10933 | 10500–12599 | ok | ok | PASS |  |
| SEQ-CL-EV-04 | events | pot-b sequential claim 4 print | ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG.pot-b | 5 | 10933 | 10500–12599 | print | print | PASS |  |
| SEQ-CL-05 | claim | claim pot-b sequential reward-cycle round 5/7 | ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG.pot-b | 6 | 13033 | 12600–14699 | ok | ok | PASS |  |
| SEQ-CL-EV-05 | events | pot-b sequential claim 5 print | ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG.pot-b | 6 | 13033 | 12600–14699 | print | print | PASS |  |
| SEQ-CL-06 | claim | claim pot-b sequential reward-cycle round 6/7 | ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG.pot-b | 7 | 15133 | 14700–16799 | ok | ok | PASS |  |
| SEQ-CL-EV-06 | events | pot-b sequential claim 6 print | ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG.pot-b | 7 | 15133 | 14700–16799 | print | print | PASS |  |
| SEQ-CL-07 | claim | claim pot-b sequential reward-cycle round 7/7 | ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG.pot-b | 8 | 17233 | 16800–18899 | ok | ok | PASS |  |
| SEQ-CL-EV-07 | events | pot-b sequential claim 7 print | ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG.pot-b | 8 | 17233 | 16800–18899 | print | print | PASS |  |
| PSP-06 | sponsor-platform | claim-sponsor-reward after pot claim (closer is not ticket NFT owner / not contract-caller) | stackspot-sponsor | 8 | 17233 | 16800–18899 | ok | ok | PASS | non-pot caller skips yield transfer and still returns ok |
| X-01 | cross-contract | stackspots get-pot-info for lifecycle pot | stackspots | 8 | 17233 | 16800–18899 | ok | ok | PASS | {"type":"ok","value":{"type":"tuple","value":{"pot-contract":{"type":"contract","value":"ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.pot-a"},"pot-id":{"type":"uint","value":"1"},"pot-name":{"type":"ascii","value":"pot-a"},"pot-owner":{"type":"contract","value":"ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5.pot-a"}}}} |
| X-02 | cross-contract | stackspots last-token-id incremented | stackspots | 8 | 17233 | 16800–18899 | > 0 | {"type":"ok","value":{"type":"uint","value":"3"}} | PASS |  |
| X-03 | cross-contract | platform sponsor NFT minted on init | stackspot-sponsor | 8 | 17233 | 16800–18899 | > 0 | {"type":"ok","value":{"type":"uint","value":"2"}} | PASS |  |
| EV-01 | events | transaction log captured every call | harness | 8 | 17233 | 16800–18899 | >= 40 txs | 174 | PASS | 134 rows with events |
| CTR-stackspots | contract-matrix | stackspots battery | stackspots | 8 | 17233 | 16800–18899 | 0 failed cases | 13/13 passed | PASS | all related cases passed |
| CTR-init-admin | contract-matrix | init-admin battery | init-admin | 8 | 17233 | 16800–18899 | 0 failed cases | 2/3 passed | FAIL | ADM-01 |
| CTR-jackpot | contract-matrix | jackpot battery | jackpot | 8 | 17233 | 16800–18899 | 0 failed cases | 43/43 passed | PASS | all related cases passed |
| CTR-sequential | contract-matrix | sequential battery | sequential | 8 | 17233 | 16800–18899 | 0 failed cases | 25/25 passed | PASS | all related cases passed |
| CTR-crowd-fund | contract-matrix | crowd-fund battery | crowd-fund | 8 | 17233 | 16800–18899 | 0 failed cases | 10/10 passed | PASS | all related cases passed |
| CTR-stackspot-sponsor | contract-matrix | stackspot-sponsor battery | stackspot-sponsor | 8 | 17233 | 16800–18899 | 0 failed cases | 7/7 passed | PASS | all related cases passed |
