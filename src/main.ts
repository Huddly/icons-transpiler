import path from 'path';
import svgToReactComponent from './svg-to-react-component';
import svgToReadme from './svg-to-readme';
import { exists, readFile } from './utils';

interface Options {
	entry: string;
	output: string;
	readme?: {
		output: string;
		template?: string;
		declarationTag?: string;
	};
}

export async function main(args: Array<any>) {
	const projectDir = process.cwd();
	const projectName = require(path.join(projectDir, 'package.json')).name;
	const options = await getOptions(projectDir);

	switch (args[2]) {
		case 'build':
		case undefined:
			await svgToReactComponent({
				projectDir,
				entry: options.entry,
				output: options.output,
			});
			break;
		case 'readme':
			if (options.readme) {
				await svgToReadme({
					projectName,
					entry: options.entry,
					output: options.readme.output,
					iconsOutput: options.output,
					template: options.readme.template,
					declarationTag: options.readme.declarationTag,
				});
			} else {
				console.error('No readme options provided');
			}
			break;
		default:
			console.error('Unknown mode');
			break;
	}
}

async function getOptions(workingDir: string): Promise<Options> {
	const defaultOptions: Options = {
		entry: './src',
		output: '.',
		readme: undefined,
	};

	let parsedConfig = {};
	const config = path.resolve(workingDir, 'build.config.json');
	if (await exists(config)) {
		parsedConfig = JSON.parse(await readFile(config, 'utf8'));
	} else {
		console.warn('build.config.js not found, using default options');
	}

	const configObject = {
		...defaultOptions,
		...parsedConfig,
	};

	if (!(await exists(configObject.entry))) {
		throw new Error(`Entry folder "${configObject.entry}" does not exist`);
	}

	return configObject;
}
