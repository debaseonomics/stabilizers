// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;

import "@chainlink/contracts/src/v0.6/ChainlinkClient.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract APIConsumer is Ownable, ChainlinkClient {
    event LogSetOracle(address oracle_);
    event LogSetJob(bytes32 jobId_);
    event LogSetFee(uint256 fee_);
    event LogSetDataRequester(address dataRequester_);

    uint256 public result;
    address public dataRequester;

    address private oracle;
    bytes32 private jobId;
    uint256 private fee;

    constructor(
        address oracle_,
        bytes32 jobId_,
        uint256 fee_,
        address dataRequester_
    ) public {
        setPublicChainlinkToken();
        oracle = oracle_;
        jobId = jobId_;
        fee = fee_ * 10**18; // 0.1 LINK
        dataRequester = dataRequester_;
    }

    function setDataRequester(address dataRequester_) external onlyOwner {
        dataRequester = dataRequester_;
        emit LogSetDataRequester(dataRequester);
    }

    function requestRandomNumber(
        string memory requestPath,
        string memory requestParms
    ) public returns (bytes32 requestId) {
        require(
            msg.sender == dataRequester,
            "Only counter can call for new data"
        );
        Chainlink.Request memory request = buildChainlinkRequest(
            jobId,
            address(this),
            this.fulfill.selector
        );

        request.add("post", requestPath);
        request.add("queryParams", requestParms);

        return sendChainlinkRequestTo(oracle, request, fee);
    }

    function fulfill(bytes32 _requestId, bytes32 result_)
        public
        recordChainlinkFulfillment(_requestId)
    {
        result = parseInt(bytes32ToString(result_));
    }

    function bytes32ToString(bytes32 _bytes32)
        public
        pure
        returns (string memory)
    {
        uint8 i = 0;
        while (i < 32 && _bytes32[i] != 0) {
            i++;
        }
        bytes memory bytesArray = new bytes(i);
        for (i = 0; i < 32 && _bytes32[i] != 0; i++) {
            bytesArray[i] = _bytes32[i];
        }
        return string(bytesArray);
    }

    function parseInt(string memory _value) public pure returns (uint256 _ret) {
        bytes memory _bytesValue = bytes(_value);
        uint256 j = 1;
        for (
            uint256 i = _bytesValue.length - 1;
            i >= 0 && i < _bytesValue.length;
            i--
        ) {
            assert(uint8(_bytesValue[i]) >= 48 && uint8(_bytesValue[i]) <= 57);
            _ret += (uint8(_bytesValue[i]) - 48) * j;
            j *= 10;
        }
    }
}
