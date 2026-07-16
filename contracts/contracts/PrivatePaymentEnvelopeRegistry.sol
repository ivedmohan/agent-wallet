// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title PrivatePaymentEnvelopeRegistry
/// @notice Stores opaque private payment envelopes for the agent wallet SDK.
/// @dev This contract never stores plaintext amounts or memos. The SDK supplies
///      a commitment hash plus optional ciphertext, and later marks the envelope
///      as executed once the offchain or sponsored payment completes.
contract PrivatePaymentEnvelopeRegistry is Ownable {
    struct PaymentEnvelope {
        address sender;
        address recipient;
        bytes32 payloadHash;
        bytes ciphertext;
        uint64 createdAt;
        uint64 updatedAt;
        uint64 executedAt;
        bool executed;
    }

    mapping(bytes32 envelopeId => PaymentEnvelope envelope) private _envelopes;
    mapping(address sender => bytes32[] envelopeIds) private _sentEnvelopeIds;
    mapping(address recipient => bytes32[] envelopeIds) private _receivedEnvelopeIds;

    event PaymentEnvelopeCommitted(
        bytes32 indexed envelopeId,
        address indexed sender,
        address indexed recipient,
        bytes32 payloadHash
    );

    event PaymentEnvelopeCiphertextUpdated(
        bytes32 indexed envelopeId,
        bytes32 indexed newPayloadHash
    );

    event PaymentEnvelopeExecuted(
        bytes32 indexed envelopeId,
        address indexed executedBy,
        bytes32 executionHash
    );

    error InvalidRecipient();
    error EmptyEnvelopeId();
    error EnvelopeAlreadyExists();
    error EnvelopeNotFound();
    error NotEnvelopeParticipant();
    error EnvelopeAlreadyExecuted();
    error EmptyCiphertext();

    constructor() Ownable(msg.sender) {}

    /// @notice Deterministically compute the envelope id for a private payment intent.
    function computeEnvelopeId(
        address sender,
        address recipient,
        bytes32 payloadHash,
        bytes32 salt
    ) public view returns (bytes32) {
        return keccak256(abi.encode(sender, recipient, payloadHash, salt, block.chainid, address(this)));
    }

    /// @notice Commit a private payment envelope. The SDK should hash the sensitive
    ///         details offchain and optionally attach opaque ciphertext.
    function commitEnvelope(
        address recipient,
        bytes32 payloadHash,
        bytes32 salt,
        bytes calldata ciphertext
    ) external returns (bytes32 envelopeId) {
        if (recipient == address(0)) revert InvalidRecipient();
        envelopeId = computeEnvelopeId(msg.sender, recipient, payloadHash, salt);
        if (envelopeId == bytes32(0)) revert EmptyEnvelopeId();
        if (_envelopes[envelopeId].sender != address(0)) revert EnvelopeAlreadyExists();

        PaymentEnvelope storage envelope = _envelopes[envelopeId];
        envelope.sender = msg.sender;
        envelope.recipient = recipient;
        envelope.payloadHash = payloadHash;
        envelope.ciphertext = ciphertext;
        envelope.createdAt = uint64(block.timestamp);
        envelope.updatedAt = uint64(block.timestamp);

        _sentEnvelopeIds[msg.sender].push(envelopeId);
        _receivedEnvelopeIds[recipient].push(envelopeId);

        emit PaymentEnvelopeCommitted(envelopeId, msg.sender, recipient, payloadHash);
    }

    /// @notice Update the opaque ciphertext or commitment if the payment intent changes.
    function updateEnvelope(
        bytes32 envelopeId,
        bytes32 payloadHash,
        bytes calldata ciphertext
    ) external {
        PaymentEnvelope storage envelope = _envelopes[envelopeId];
        if (envelope.sender == address(0)) revert EnvelopeNotFound();
        if (msg.sender != envelope.sender && msg.sender != envelope.recipient && msg.sender != owner()) {
            revert NotEnvelopeParticipant();
        }

        envelope.payloadHash = payloadHash;
        envelope.ciphertext = ciphertext;
        envelope.updatedAt = uint64(block.timestamp);

        emit PaymentEnvelopeCiphertextUpdated(envelopeId, payloadHash);
    }

    /// @notice Mark the envelope executed once the sponsored or offchain payment is complete.
    function markExecuted(bytes32 envelopeId, bytes32 executionHash) external {
        PaymentEnvelope storage envelope = _envelopes[envelopeId];
        if (envelope.sender == address(0)) revert EnvelopeNotFound();
        if (msg.sender != envelope.sender && msg.sender != envelope.recipient && msg.sender != owner()) {
            revert NotEnvelopeParticipant();
        }
        if (envelope.executed) revert EnvelopeAlreadyExecuted();

        envelope.executed = true;
        envelope.executedAt = uint64(block.timestamp);

        emit PaymentEnvelopeExecuted(envelopeId, msg.sender, executionHash);
    }

    /// @notice Read back the stored envelope. Amounts are never stored here.
    function getEnvelope(bytes32 envelopeId)
        external
        view
        returns (
            address sender,
            address recipient,
            bytes32 payloadHash,
            bytes memory ciphertext,
            uint64 createdAt,
            uint64 updatedAt,
            uint64 executedAt,
            bool executed
        )
    {
        PaymentEnvelope storage envelope = _envelopes[envelopeId];
        if (envelope.sender == address(0)) revert EnvelopeNotFound();
        return (
            envelope.sender,
            envelope.recipient,
            envelope.payloadHash,
            envelope.ciphertext,
            envelope.createdAt,
            envelope.updatedAt,
            envelope.executedAt,
            envelope.executed
        );
    }

    /// @notice Return how many private envelopes a sender has committed.
    function getSentEnvelopeCount(address sender) external view returns (uint256) {
        return _sentEnvelopeIds[sender].length;
    }

    /// @notice Return how many private envelopes a recipient has received.
    function getReceivedEnvelopeCount(address recipient) external view returns (uint256) {
        return _receivedEnvelopeIds[recipient].length;
    }

    /// @notice Return one sender envelope id by index.
    function getSentEnvelopeId(address sender, uint256 index) external view returns (bytes32) {
        return _sentEnvelopeIds[sender][index];
    }

    /// @notice Return one recipient envelope id by index.
    function getReceivedEnvelopeId(address recipient, uint256 index) external view returns (bytes32) {
        return _receivedEnvelopeIds[recipient][index];
    }

    /// @notice True if the caller is involved in the envelope or is the owner.
    function canAccess(bytes32 envelopeId, address account) external view returns (bool) {
        PaymentEnvelope storage envelope = _envelopes[envelopeId];
        if (envelope.sender == address(0)) return false;
        return account == envelope.sender || account == envelope.recipient || account == owner();
    }
}
