// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract SomniaDreamRegistry {
    struct Dream {
        address creator;
        string contentHash;
        string category;
        uint256 createdAt;
        uint256 expiresAt;
        uint256 paid;
        uint256 signals;
        bool hidden;
        bool featured;
    }

    uint256 public constant STANDARD_PUBLISH_FEE = 10e6;
    uint256 public constant FEATURED_PUBLISH_FEE = 100e6;
    uint256 public constant DISPLAY_DURATION = 3 days;
    uint256 public constant TREASURY_BPS = 5000;
    uint256 public constant DREAM_VAULT_BPS = 3000;
    uint256 public constant REVIEWER_REWARDS_BPS = 2000;
    uint256 public constant BPS_DENOMINATOR = 10000;

    IERC20 public immutable usdc;
    address public treasury;
    address public dreamVault;
    address public reviewerRewards;
    address public owner;
    uint256 public nextDreamId = 1;

    mapping(uint256 => Dream) public dreams;
    mapping(uint256 => mapping(address => bool)) public hasSignaled;

    event DreamPublished(
        uint256 indexed dreamId,
        address indexed creator,
        string contentHash,
        string category,
        uint256 paid,
        uint256 expiresAt,
        bool featured
    );
    event DreamSignaled(uint256 indexed dreamId, address indexed supporter, bool active);
    event DreamHidden(uint256 indexed dreamId, bool hidden);
    event RecipientsUpdated(address treasury, address dreamVault, address reviewerRewards);

    modifier onlyOwner() {
        require(msg.sender == owner, "NOT_OWNER");
        _;
    }

    constructor(
        address usdc_,
        address treasury_,
        address dreamVault_,
        address reviewerRewards_
    ) {
        require(usdc_ != address(0), "BAD_USDC");
        require(treasury_ != address(0), "BAD_TREASURY");
        require(dreamVault_ != address(0), "BAD_VAULT");
        require(reviewerRewards_ != address(0), "BAD_REWARDS");

        usdc = IERC20(usdc_);
        treasury = treasury_;
        dreamVault = dreamVault_;
        reviewerRewards = reviewerRewards_;
        owner = msg.sender;
    }

    function publishDream(string calldata contentHash, string calldata category) external returns (uint256 dreamId) {
        return _publishDream(contentHash, category, false);
    }

    function publishDreamWithPlacement(
        string calldata contentHash,
        string calldata category,
        bool featured
    ) external returns (uint256 dreamId) {
        return _publishDream(contentHash, category, featured);
    }

    function _publishDream(
        string calldata contentHash,
        string calldata category,
        bool featured
    ) internal returns (uint256 dreamId) {
        require(bytes(contentHash).length > 0, "EMPTY_HASH");
        require(bytes(category).length > 0, "EMPTY_CATEGORY");

        uint256 fee = featured ? FEATURED_PUBLISH_FEE : STANDARD_PUBLISH_FEE;
        uint256 expiresAt = block.timestamp + DISPLAY_DURATION;

        _collectAndSplitFee(msg.sender, fee);

        dreamId = nextDreamId++;
        dreams[dreamId] = Dream({
            creator: msg.sender,
            contentHash: contentHash,
            category: category,
            createdAt: block.timestamp,
            expiresAt: expiresAt,
            paid: fee,
            signals: 0,
            hidden: false,
            featured: featured
        });

        emit DreamPublished(dreamId, msg.sender, contentHash, category, fee, expiresAt, featured);
    }

    function signalDream(uint256 dreamId) external {
        Dream storage dream = dreams[dreamId];
        require(dream.creator != address(0), "UNKNOWN_DREAM");
        require(!dream.hidden, "HIDDEN_DREAM");
        require(block.timestamp <= dream.expiresAt, "EXPIRED_DREAM");

        if (hasSignaled[dreamId][msg.sender]) {
            hasSignaled[dreamId][msg.sender] = false;
            dream.signals -= 1;
            emit DreamSignaled(dreamId, msg.sender, false);
        } else {
            hasSignaled[dreamId][msg.sender] = true;
            dream.signals += 1;
            emit DreamSignaled(dreamId, msg.sender, true);
        }
    }

    function setDreamHidden(uint256 dreamId, bool hidden) external onlyOwner {
        require(dreams[dreamId].creator != address(0), "UNKNOWN_DREAM");
        dreams[dreamId].hidden = hidden;
        emit DreamHidden(dreamId, hidden);
    }

    function updateRecipients(
        address treasury_,
        address dreamVault_,
        address reviewerRewards_
    ) external onlyOwner {
        require(treasury_ != address(0), "BAD_TREASURY");
        require(dreamVault_ != address(0), "BAD_VAULT");
        require(reviewerRewards_ != address(0), "BAD_REWARDS");

        treasury = treasury_;
        dreamVault = dreamVault_;
        reviewerRewards = reviewerRewards_;

        emit RecipientsUpdated(treasury_, dreamVault_, reviewerRewards_);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "BAD_OWNER");
        owner = newOwner;
    }

    function isDreamLive(uint256 dreamId) external view returns (bool) {
        Dream storage dream = dreams[dreamId];
        return dream.creator != address(0) && !dream.hidden && block.timestamp <= dream.expiresAt;
    }

    function _collectAndSplitFee(address payer, uint256 fee) internal {
        uint256 treasuryAmount = (fee * TREASURY_BPS) / BPS_DENOMINATOR;
        uint256 vaultAmount = (fee * DREAM_VAULT_BPS) / BPS_DENOMINATOR;
        uint256 reviewerAmount = fee - treasuryAmount - vaultAmount;

        require(usdc.transferFrom(payer, treasury, treasuryAmount), "TREASURY_TRANSFER_FAILED");
        require(usdc.transferFrom(payer, dreamVault, vaultAmount), "VAULT_TRANSFER_FAILED");
        require(usdc.transferFrom(payer, reviewerRewards, reviewerAmount), "REWARDS_TRANSFER_FAILED");
    }
}
