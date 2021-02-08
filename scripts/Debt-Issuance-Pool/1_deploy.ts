import { run, ethers } from 'hardhat';

import BurnPoolArtifact from '../../artifacts/contracts/Debt-Issuance-Pool/BurnPool.sol/BurnPool.json';
import OracleArtifact from '../../artifacts/contracts/Debt-Issuance-Pool/Oracle.sol/Oracle.json';

import { BurnPoolFactory } from '../../typechain/BurnPoolFactory';
import { OracleFactory } from '../../typechain/OracleFactory';

import { parseEther, parseUnits } from 'ethers/lib/utils';

async function main() {
	const signer = await ethers.getSigners();

	try {
		const burnPoolFactory = (new ethers.ContractFactory(
			BurnPoolArtifact.abi,
			BurnPoolArtifact.bytecode,
			signer[0]
		) as any) as BurnPoolFactory;

		const oracleFactory = (new ethers.ContractFactory(
			OracleArtifact.abi,
			OracleArtifact.bytecode,
			signer[0]
		) as any) as OracleFactory;

		const debase = '0x9248c485b0B80f76DA451f167A8db30F33C70907';
		const dai = '0x6b175474e89094c44da98b954eedeac495271d0f';
		const debasePolicy = '0x989Edd2e87B1706AB25b2E8d9D9480DE3Cc383eD';
		const burnPool1 = '0xF4168cc431e9a8310e595dB9F7E2564cC96F5D51';
		const burnPool2 = '0xf5cB771023706Ca566eA6128b88e03A262737479';
		const epochs = 5;
		const oraclePeriod = 1000;
		const curveShifter = 0;
		const initialRewardShare = parseUnits("5",16);
		const multiSig = '0xf038C1cfaDAce2C0E5963Ab5C0794B9575e1D2c2';
		const multiSigShare = parseUnits('2',17);
		const mean = '0x00000000000000000000000000000000';
		const deviation = '0x3fff609aa6ab2c4acd8e2f11c9afa275';
		const oneDivDeviationSqrtTwoPi = '0x3ffd8c97fc2f6c6821221e4ac2fd1e34';
		const twoDeviationSquare = '0x4000e5a9a7c429bb0f601a46fe1645e7';

		const burnPool = await burnPoolFactory.deploy();
		const oracle = await oracleFactory.deploy(debase, dai, burnPool.address);

		await burnPool.initialize(
			debase,
			oracle.address,
			debasePolicy,
			burnPool1,
			burnPool2,
			epochs,
			oraclePeriod,
			curveShifter,
			initialRewardShare,
			multiSig,
			multiSigShare,
			mean,
			deviation,
			oneDivDeviationSqrtTwoPi,
			twoDeviationSquare
		);
	} catch (error) {
		console.error(error);
	}
}

main().then(() => process.exit(0)).catch((error) => {
	console.error(error);
	process.exit(1);
});
