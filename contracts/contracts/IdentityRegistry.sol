// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @title IdentityRegistry
/// @notice ERC-8004 Identity Registry — each agent is an ERC-721 token with metadata
/// @dev Per-chain singleton. register() mints an agent identity. The agentWallet is
///      verified via EIP-712 signature, binding the pay-to address to the identity.
contract IdentityRegistry is ERC721URIStorage, Ownable {
    using ECDSA for bytes32;

    bytes32 private constant _DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant _SET_WALLET_TYPEHASH =
        keccak256("SetWallet(uint256 agentId,address newWallet,uint256 deadline)");
    string private constant _RESERVED_WALLET_KEY = "agentWallet";

    uint256 private _nextAgentId = 1;
    mapping(uint256 agentId => address wallet) private _agentWallets;
    mapping(uint256 agentId => mapping(string metadataKey => bytes value)) private _metadata;

    // ── Events ─────────────────────────────────────────────────
    event Registered(uint256 indexed agentId, string agentURI, address indexed owner);
    event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy);
    event MetadataSet(uint256 indexed agentId, string indexed indexedMetadataKey, string metadataKey, bytes metadataValue);

    // ── Errors ──────────────────────────────────────────────────
    error ReservedMetadataKey();
    error InvalidSignature();
    error SignatureExpired();

    // ── Constructor ─────────────────────────────────────────────
    constructor() ERC721("Agent Identity", "AGENT") Ownable(msg.sender) {}

    // ── Registration ────────────────────────────────────────────
    function register(string calldata agentURI) external returns (uint256 agentId) {
        agentId = _nextAgentId++;
        _safeMint(msg.sender, agentId);
        _setTokenURI(agentId, agentURI);
        _agentWallets[agentId] = msg.sender;
        emit Registered(agentId, agentURI, msg.sender);
    }

    struct MetadataEntry { string metadataKey; bytes metadataValue; }

    function register(string calldata agentURI, MetadataEntry[] calldata metadata) external returns (uint256 agentId) {
        agentId = _nextAgentId++;
        _safeMint(msg.sender, agentId);
        _setTokenURI(agentId, agentURI);
        _agentWallets[agentId] = msg.sender;
        emit Registered(agentId, agentURI, msg.sender);
        for (uint256 i = 0; i < metadata.length; i++) {
            if (keccak256(bytes(metadata[i].metadataKey)) == keccak256(bytes(_RESERVED_WALLET_KEY))) continue;
            _metadata[agentId][metadata[i].metadataKey] = metadata[i].metadataValue;
            emit MetadataSet(agentId, metadata[i].metadataKey, metadata[i].metadataKey, metadata[i].metadataValue);
        }
    }

    function register() external returns (uint256 agentId) {
        agentId = _nextAgentId++;
        _safeMint(msg.sender, agentId);
        _agentWallets[agentId] = msg.sender;
        emit Registered(agentId, "", msg.sender);
    }

    // ── Agent URI ───────────────────────────────────────────────
    function setAgentURI(uint256 agentId, string calldata newURI) external {
        _requireOwned(agentId);
        if (_ownerOf(agentId) != msg.sender && !isApprovedForAll(_ownerOf(agentId), msg.sender)) {
            revert OwnableUnauthorizedAccount(msg.sender);
        }
        _setTokenURI(agentId, newURI);
        emit URIUpdated(agentId, newURI, msg.sender);
    }

    // ── Agent Wallet ────────────────────────────────────────────
    function getAgentWallet(uint256 agentId) external view returns (address) {
        _requireOwned(agentId);
        return _agentWallets[agentId];
    }

    /// @notice Set agent wallet with EIP-712 signature from the new wallet
    function setAgentWallet(uint256 agentId, address newWallet, uint256 deadline, bytes calldata signature) external {
        _requireOwned(agentId);
        if (deadline < block.timestamp) revert SignatureExpired();
        bytes32 structHash = keccak256(abi.encode(_SET_WALLET_TYPEHASH, agentId, newWallet, deadline));
        bytes32 digest = MessageHashUtils.toTypedDataHash(
            keccak256(abi.encode(_DOMAIN_TYPEHASH, keccak256(bytes("AgentWallet IdentityRegistry")), keccak256(bytes("1")), block.chainid, address(this))),
            structHash
        );
        if (digest.recover(signature) != newWallet) revert InvalidSignature();
        _agentWallets[agentId] = newWallet;
    }

    function unsetAgentWallet(uint256 agentId) external {
        _requireOwned(agentId);
        if (_ownerOf(agentId) != msg.sender && !isApprovedForAll(_ownerOf(agentId), msg.sender)) {
            revert OwnableUnauthorizedAccount(msg.sender);
        }
        delete _agentWallets[agentId];
    }

    // ── Metadata ────────────────────────────────────────────────
    function getMetadata(uint256 agentId, string calldata metadataKey) external view returns (bytes memory) {
        _requireOwned(agentId);
        return _metadata[agentId][metadataKey];
    }

    function setMetadata(uint256 agentId, string calldata metadataKey, bytes calldata metadataValue) external {
        _requireOwned(agentId);
        if (_ownerOf(agentId) != msg.sender && !isApprovedForAll(_ownerOf(agentId), msg.sender)) {
            revert OwnableUnauthorizedAccount(msg.sender);
        }
        if (keccak256(bytes(metadataKey)) == keccak256(bytes(_RESERVED_WALLET_KEY))) revert ReservedMetadataKey();
        _metadata[agentId][metadataKey] = metadataValue;
        emit MetadataSet(agentId, metadataKey, metadataKey, metadataValue);
    }

    // ── Overrides ───────────────────────────────────────────────
    /// @notice Clear wallet on transfer (ERC-8004 spec). New owner must re-verify via setAgentWallet().
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        address result = super._update(to, tokenId, auth);
        if (from != address(0)) {
            delete _agentWallets[tokenId];
        }
        return result;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) { return super.tokenURI(tokenId); }
    function supportsInterface(bytes4 interfaceId) public view override returns (bool) { return super.supportsInterface(interfaceId); }
}
