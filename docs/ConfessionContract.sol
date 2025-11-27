// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface AggregatorV3Interface {
    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    );
    function decimals() external view returns (uint8);
}

contract CryptoConfessions {
    address public owner;
    uint256 public feeUsdCents;
    uint256 public totalConfessions;
    AggregatorV3Interface public priceFeed;
    
    mapping(string => uint256) public confessions;
    
    event ConfessionStored(string indexed confessionHash, address indexed author, uint256 timestamp, uint256 feePaid);
    event FeeUpdated(uint256 oldFee, uint256 newFee);
    event Withdrawal(address indexed to, uint256 amount);
    event PriceFeedUpdated(address oldFeed, address newFeed);
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    constructor(uint256 _feeUsdCents, address _priceFeed) {
        owner = msg.sender;
        feeUsdCents = _feeUsdCents;
        priceFeed = AggregatorV3Interface(_priceFeed);
    }
    
    function getEthPrice() public view returns (uint256) {
        (, int256 price,,,) = priceFeed.latestRoundData();
        require(price > 0, "Invalid price");
        return uint256(price);
    }
    
    function getFeeInWei() public view returns (uint256) {
        uint256 ethPrice = getEthPrice();
        uint256 feeUsd = feeUsdCents * 1e6;
        uint256 feeWei = (feeUsd * 1e18) / ethPrice;
        return feeWei;
    }
    
    function storeConfessionHash(string calldata confessionHash) external payable {
        uint256 requiredFee = getFeeInWei();
        require(msg.value >= requiredFee, "Insufficient fee");
        require(bytes(confessionHash).length > 0, "Empty hash");
        require(confessions[confessionHash] == 0, "Already exists");
        
        confessions[confessionHash] = block.timestamp;
        totalConfessions++;
        
        emit ConfessionStored(confessionHash, msg.sender, block.timestamp, msg.value);
        
        if (msg.value > requiredFee) {
            payable(msg.sender).transfer(msg.value - requiredFee);
        }
    }
    
    function getConfession(string calldata confessionHash) external view returns (uint256) {
        return confessions[confessionHash];
    }
    
    function setFee(uint256 _newFeeUsdCents) external onlyOwner {
        uint256 oldFee = feeUsdCents;
        feeUsdCents = _newFeeUsdCents;
        emit FeeUpdated(oldFee, _newFeeUsdCents);
    }
    
    function setPriceFeed(address _newPriceFeed) external onlyOwner {
        address oldFeed = address(priceFeed);
        priceFeed = AggregatorV3Interface(_newPriceFeed);
        emit PriceFeedUpdated(oldFeed, _newPriceFeed);
    }
    
    function withdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No funds");
        payable(owner).transfer(balance);
        emit Withdrawal(owner, balance);
    }
    
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        owner = newOwner;
    }
    
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
    
    function confessionFee() external view returns (uint256) {
        return getFeeInWei();
    }
}
