import { run, ethers } from 'hardhat';

import RewarderArtifact from '../../artifacts/contracts/SP1-Liquidity/Rewarder.sol/Rewarder.json';
import DebaseArtifact from '../../artifacts/contracts/SP1-Liquidity/Mock/Debase.sol/Debase.json';
import TokenArtifact from '../../artifacts/contracts/SP1-Liquidity/Mock/Token.sol/Token.json';

import { RewarderFactory } from '../../typechain/RewarderFactory';
import { DebaseFactory } from '../../typechain/DebaseFactory';
import { TokenFactory } from '../../typechain/TokenFactory';

import { parseEther, parseUnits } from 'ethers/lib/utils';

async function main() {
	const signer = await ethers.getSigners();

	const address = await signer[0].getAddress();

	try {
		const rewarderFactory = (new ethers.ContractFactory(
			RewarderArtifact.abi,
			RewarderArtifact.bytecode,
			signer[0]
		) as any) as RewarderFactory;

		const rewarder = await rewarderFactory.deploy(
			'0x0f2968F1dD68a31f5c45A17FaF4a4ACD6fc9e783',
			'0x9F810f25A4E3101deA39F3fdD941f7E439941171',
			'0x374b05Aed6Ffc294F98859C97A714D2BA16BD13c',
			'0x6C1dEA76a746F6295f33e5738e9015dd4267f533',
			address,
			parseUnits('1', 17),
			100,
			0,
			address,
			parseUnits('5',17)
		);

		console.log(rewarder.address);
	} catch (error) {
		console.error(error);
	}
}

main().then(() => process.exit(0)).catch((error) => {
	console.error(error);
	process.exit(1);
});
