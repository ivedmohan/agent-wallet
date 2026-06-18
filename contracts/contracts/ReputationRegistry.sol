// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/// @title ReputationRegistry
/// @notice ERC-8004 Reputation Registry — on-chain feedback signals for agents
/// @dev Per-chain singleton. References IdentityRegistry for agent existence checks.
///      Feedback includes value + decimals, tags, and optional proof-of-payment URIs.
contract ReputationRegistry {
    address public identityRegistry;

    struct FeedbackEntry {
        int128 value;
        uint8 valueDecimals;
        string tag1;
        string tag2;
        bool isRevoked;
    }

    mapping(uint256 agentId => mapping(address clientAddress => FeedbackEntry[] entries)) private _feedbacks;
    mapping(uint256 agentId => uint64 activeCount) private _activeFeedbackCount;

    // ── Events (ERC-8004 spec) ─────────────────────────────────
    event NewFeedback(
        uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex,
        int128 value, uint8 valueDecimals,
        string indexed indexedTag1, string tag1, string tag2,
        string endpoint, string feedbackURI, bytes32 feedbackHash
    );
    event FeedbackRevoked(uint256 indexed agentId, address indexed clientAddress, uint64 indexed feedbackIndex);
    event ResponseAppended(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, address indexed responder, string responseURI, bytes32 responseHash);

    // ── Errors ──────────────────────────────────────────────────
    error InvalidFeedbackIndex();
    error FeedbackAlreadyRevoked();
    error CallerCannotGiveFeedback();
    error InvalidValueDecimals();
    error RegistryAlreadyInitialized();

    // ── Initializer ─────────────────────────────────────────────
    function initialize(address identityRegistry_) external {
        if (identityRegistry != address(0)) revert RegistryAlreadyInitialized();
        require(identityRegistry_ != address(0), "invalid registry address");
        identityRegistry = identityRegistry_;
    }

    // ── Give Feedback ───────────────────────────────────────────
    function giveFeedback(
        uint256 agentId, int128 value, uint8 valueDecimals,
        string calldata tag1, string calldata tag2,
        string calldata endpoint, string calldata feedbackURI, bytes32 feedbackHash
    ) external {
        _requireAgentExists(agentId);
        if (_isAgentOwnerOrOperator(agentId, msg.sender)) revert CallerCannotGiveFeedback();
        if (valueDecimals > 18) revert InvalidValueDecimals();

        FeedbackEntry[] storage entries = _feedbacks[agentId][msg.sender];
        uint64 feedbackIndex = uint64(entries.length + 1);
        entries.push(FeedbackEntry({ value: value, valueDecimals: valueDecimals, tag1: tag1, tag2: tag2, isRevoked: false }));
        _activeFeedbackCount[agentId]++;

        emit NewFeedback(agentId, msg.sender, feedbackIndex, value, valueDecimals, tag1, tag1, tag2, endpoint, feedbackURI, feedbackHash);
    }

    // ── Revoke Feedback ─────────────────────────────────────────
    function revokeFeedback(uint256 agentId, uint64 feedbackIndex) external {
        FeedbackEntry[] storage entries = _feedbacks[agentId][msg.sender];
        if (feedbackIndex == 0 || feedbackIndex > entries.length) revert InvalidFeedbackIndex();
        FeedbackEntry storage entry = entries[feedbackIndex - 1];
        if (entry.isRevoked) revert FeedbackAlreadyRevoked();
        entry.isRevoked = true;
        _activeFeedbackCount[agentId]--;
        emit FeedbackRevoked(agentId, msg.sender, feedbackIndex);
    }

    // ── Append Response ─────────────────────────────────────────
    function appendResponse(uint256 agentId, address clientAddress, uint64 feedbackIndex, string calldata responseURI, bytes32 responseHash) external {
        if (feedbackIndex == 0 || feedbackIndex > _feedbacks[agentId][clientAddress].length) revert InvalidFeedbackIndex();
        emit ResponseAppended(agentId, clientAddress, feedbackIndex, msg.sender, responseURI, responseHash);
    }

    // ── Read Functions ──────────────────────────────────────────
    function getSummary(uint256 agentId, address[] calldata clientAddresses, string calldata tag1, string calldata tag2)
        external view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)
    {
        bool filterTag1 = bytes(tag1).length > 0;
        bool filterTag2 = bytes(tag2).length > 0;
        bool decimalsSet = false;

        for (uint256 i = 0; i < clientAddresses.length; i++) {
            FeedbackEntry[] storage entries = _feedbacks[agentId][clientAddresses[i]];
            for (uint256 j = 0; j < entries.length; j++) {
                FeedbackEntry storage entry = entries[j];
                if (entry.isRevoked) continue;
                if (filterTag1 && keccak256(bytes(entry.tag1)) != keccak256(bytes(tag1))) continue;
                if (filterTag2 && keccak256(bytes(entry.tag2)) != keccak256(bytes(tag2))) continue;
                count++;
                summaryValue += entry.value;
                if (!decimalsSet) { summaryValueDecimals = entry.valueDecimals; decimalsSet = true; }
            }
        }
    }

    function readFeedback(uint256 agentId, address clientAddress, uint64 feedbackIndex)
        external view returns (int128 value, uint8 valueDecimals, string memory tag1, string memory tag2, bool isRevoked)
    {
        if (feedbackIndex == 0 || feedbackIndex > _feedbacks[agentId][clientAddress].length) revert InvalidFeedbackIndex();
        FeedbackEntry storage entry = _feedbacks[agentId][clientAddress][feedbackIndex - 1];
        return (entry.value, entry.valueDecimals, entry.tag1, entry.tag2, entry.isRevoked);
    }

    function getActiveFeedbackCount(uint256 agentId) external view returns (uint64) { return _activeFeedbackCount[agentId]; }

    // ── Internal ────────────────────────────────────────────────
    function _requireAgentExists(uint256 agentId) internal view {
        (bool success, bytes memory data) = identityRegistry.staticcall(
            abi.encodeWithSelector(0x6352211e /* ownerOf(uint256) */, agentId)
        );
        require(success && data.length == 32, "agent does not exist");
    }

    function _isAgentOwnerOrOperator(uint256 agentId, address caller) internal view returns (bool) {
        (bool success, bytes memory data) = identityRegistry.staticcall(
            abi.encodeWithSelector(0x6352211e, agentId)
        );
        if (!success || data.length != 32) return false;
        address owner = abi.decode(data, (address));
        if (owner == caller) return true;
        (success, data) = identityRegistry.staticcall(
            abi.encodeWithSelector(0xe985e9c5 /* isApprovedForAll(address,address) */, owner, caller)
        );
        return success && data.length == 32 && abi.decode(data, (bool));
    }
}
