export const somniaDreamRegistryAbi = [
  {
    type: "function",
    name: "publishDream",
    stateMutability: "nonpayable",
    inputs: [
      { name: "contentHash", type: "string" },
      { name: "category", type: "string" }
    ],
    outputs: [{ name: "dreamId", type: "uint256" }]
  },
  {
    type: "function",
    name: "publishDreamWithPlacement",
    stateMutability: "nonpayable",
    inputs: [
      { name: "contentHash", type: "string" },
      { name: "category", type: "string" },
      { name: "featured", type: "bool" }
    ],
    outputs: [{ name: "dreamId", type: "uint256" }]
  },
  {
    type: "function",
    name: "signalDream",
    stateMutability: "nonpayable",
    inputs: [{ name: "dreamId", type: "uint256" }],
    outputs: []
  },
  {
    type: "event",
    name: "DreamPublished",
    inputs: [
      { indexed: true, name: "dreamId", type: "uint256" },
      { indexed: true, name: "creator", type: "address" },
      { indexed: false, name: "contentHash", type: "string" },
      { indexed: false, name: "category", type: "string" },
      { indexed: false, name: "paid", type: "uint256" },
      { indexed: false, name: "expiresAt", type: "uint256" },
      { indexed: false, name: "featured", type: "bool" }
    ]
  },
  {
    type: "event",
    name: "DreamSignaled",
    inputs: [
      { indexed: true, name: "dreamId", type: "uint256" },
      { indexed: true, name: "supporter", type: "address" },
      { indexed: false, name: "active", type: "bool" }
    ]
  }
] as const;

export const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }]
  }
] as const;
