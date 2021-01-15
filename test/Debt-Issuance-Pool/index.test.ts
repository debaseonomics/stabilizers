import { ethers } from 'hardhat';
import { BigNumber, Signer } from 'ethers';
import { expect } from 'chai';

import BurnPoolArtifact from '../../artifacts/contracts/Debt-Issuance-Pool/BurnPool.sol/BurnPool.json';
import OracleArtifact from '../../artifacts/contracts/Debt-Issuance-Pool/Oracle.sol/Oracle.json';

import { BurnPoolFactory } from '../../typechain/BurnPoolFactory';
import { OracleFactory } from '../../typechain/OracleFactory';

import { BurnPool } from '../../typechain/BurnPool';
import { Oracle } from '../../typechain/Oracle';

import { formatEther, parseEther, parseUnits } from 'ethers/lib/utils';

describe('Debt Issuance Pool', () => {});
