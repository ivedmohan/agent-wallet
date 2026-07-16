# ERC-8004 Agent Registry — Fuji Deployment (v2)

Deployed via `hardhat run scripts/deploy.ts --network avalancheFuji`

| Contract | Address | Explorer |
|----------|---------|----------|
| IdentityRegistry | `0x3F5Ee79771C2628D3941Bc015d306C194DA2E425` | [Snowtrace](https://testnet.snowtrace.io/address/0x3F5Ee79771C2628D3941Bc015d306C194DA2E425) |
| ReputationRegistry | `0x351487d9E592B0D6682b0027a2eA099ab2652B10` | [Snowtrace](https://testnet.snowtrace.io/address/0x351487d9E592B0D6682b0027a2eA099ab2652B10) |
| PrivatePaymentEnvelopeRegistry | _deploy with `scripts/deploy.ts`_ | _add after next Fuji deploy_ |
| Test Agent | ID 1 — registered to deployer | |

Add to `.env`:
```
IDENTITY_REGISTRY=0x3F5Ee79771C2628D3941Bc015d306C194DA2E425
REPUTATION_REGISTRY=0x351487d9E592B0D6682b0027a2eA099ab2652B10
PRIVATE_PAYMENT_ENVELOPE_REGISTRY=
```
