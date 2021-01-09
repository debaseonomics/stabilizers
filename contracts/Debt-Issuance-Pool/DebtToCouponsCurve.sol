// SPDX-License-Identifier: MIT
pragma solidity >=0.6.6;

import "./lib/ABDKMathQuad.sol";

contract DebtToCouponsCurve {
    bytes16 MINUS_ONE = 0xbfff0000000000000000000000000000;
    bytes16 ONE = 0x3fff0000000000000000000000000000;
    bytes16 TWO = 0x40000000000000000000000000000000;
    bytes16 SQRT_TWO_PI = 0x400040d931fee3b2061deb32699c0423;
    bytes16 TENE18 = 0x403abc16d674ec800000000000000000;

    function calculateDebtToCoupons(
        uint256 balance,
        uint256 priceDelta,
        bytes16 mean,
        bytes16 deviation
    ) public view returns (uint256) {
        bytes16 balance_bytes16 = ABDKMathQuad.fromUInt(balance);
        bytes16 priceDelta_bytes16 =
            ABDKMathQuad.div(ABDKMathQuad.fromUInt(priceDelta), TENE18);

        bytes16 res1 =
            ABDKMathQuad.div(ONE, ABDKMathQuad.mul(deviation, SQRT_TWO_PI));

        bytes16 res2 =
            ABDKMathQuad.sub(ABDKMathQuad.ln(priceDelta_bytes16), mean);

        bytes16 res3 =
            ABDKMathQuad.mul(
                MINUS_ONE,
                ABDKMathQuad.div(
                    ABDKMathQuad.mul(res2, res2),
                    ABDKMathQuad.mul(
                        TWO,
                        ABDKMathQuad.mul(deviation, deviation)
                    )
                )
            );

        return
            ABDKMathQuad.toUInt(
                ABDKMathQuad.mul(
                    ABDKMathQuad.mul(res1, ABDKMathQuad.exp(res3)),
                    balance_bytes16
                )
            );
    }
}
