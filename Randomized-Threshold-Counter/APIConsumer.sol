// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;

import "@chainlink/contracts/src/v0.6/ChainlinkClient.sol";

contract APIConsumer is ChainlinkClient {
    uint256 public result;
    address public counter;

    address private oracle;
    bytes32 private jobId;
    uint256 private fee;

    constructor(address counter_) public {
        setPublicChainlinkToken();
        oracle = 0xAA1DC356dc4B18f30C347798FD5379F3D77ABC5b;
        jobId = "02a344a308324a3c98a8c157150925d8";
        fee = 0.1 * 10**18; // 0.1 LINK
        counter = counter_;
    }

    function requestRandomNumber(string memory requestStr)
        public
        returns (bytes32 requestId)
    {
        require(msg.sender == counter, "Only counter can call for new data");
        Chainlink.Request memory request = buildChainlinkRequest(
            jobId,
            address(this),
            this.fulfill.selector
        );

        request.add(
            "post",
            "https://debaseonomics.io/.netlify/functions/randomNumber"
        );
        request.add("queryParams", requestStr);

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
