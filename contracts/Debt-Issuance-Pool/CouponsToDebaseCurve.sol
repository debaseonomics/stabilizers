// SPDX-License-Identifier: MIT
pragma solidity >=0.6.6;

import "./lib/ABDKMathQuad.sol";

contract CouponsToDebaseCurve {
    bytes16 private MINUS_ONE = 0xbfff0000000000000000000000000000;
    bytes16 private ONE = 0x3fff0000000000000000000000000000;
    bytes16 private TWO = 0x40000000000000000000000000000000;
    bytes16 private SQRT_TWO_PI = 0x400040d931fee3b2061deb32699c0423;
    bytes16 private TENE18 = 0x403abc16d674ec800000000000000000;

    function calculateCouponsToDebase(
        uint256 balance,
        uint256 priceDelta,
        bytes16 mean,
        bytes16 oneDivDeviationSqrtTwoPi,
        bytes16 twoDeviationSquare
    ) public view returns (uint256) {
        bytes16 balance_bytes16 = ABDKMathQuad.fromUInt(balance);
        bytes16 priceDelta_bytes16 =
            ABDKMathQuad.div(ABDKMathQuad.fromUInt(priceDelta), TENE18);

        bytes16 res1 =
            ABDKMathQuad.sub(ABDKMathQuad.ln(priceDelta_bytes16), mean);

        bytes16 res2 =
            ABDKMathQuad.mul(
                MINUS_ONE,
                ABDKMathQuad.div(
                    ABDKMathQuad.mul(res1, res1),
                    twoDeviationSquare
                )
            );

        return
            ABDKMathQuad.toUInt(
                ABDKMathQuad.mul(
                    ABDKMathQuad.mul(
                        oneDivDeviationSqrtTwoPi,
                        ABDKMathQuad.exp(res2)
                    ),
                    balance_bytes16
                )
            );
    }
}
