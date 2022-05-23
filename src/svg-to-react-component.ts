import fs from 'fs';
import path from 'path';
import prettier from 'prettier';
import camelCase from 'camelcase';
import { exists, mkdir, rm, readDir, readFile, writeFile, prettierOptions, logTranspileResult } from './utils';
import * as ts from 'typescript';

interface Options {
	projectDir: string;
	entry: string;
	output: string;
}

interface Component {
	name: string;
	file: string;
}

export default async function svgToReactComponent(options: Options) {
	const outputDir = path.resolve(options.output);
	// Reset
	if (await exists(outputDir)) {
		await rm(outputDir, { recursive: true });
	}
	await mkdir(outputDir);

	const folders = ['.'];
	const allFilesAndFolders = await readDir(options.entry);
	const generatedFiles = [];
	folders.push(...allFilesAndFolders.filter((file) => fs.lstatSync(path.join(options.entry, file)).isDirectory()));

	for (const folder of folders) {
		const files = await readDir(path.join(options.entry, folder));

		const svgFiles = files.filter((file) => file.endsWith('.svg'));
		if (!svgFiles.length) continue;

		if (!(await exists(path.resolve(options.output, folder)))) {
			await mkdir(path.resolve(options.output, folder));
		}

		const components = await convertAllSvgsToReactComponent(
			path.join(options.entry, folder),
			path.join(options.output, folder)
		);
		generatedFiles.push(...components);

		await createIndexFile(components, path.resolve(options.output, folder));
	}
	await logTranspileResult(generatedFiles);
}

async function convertAllSvgsToReactComponent(
	entry: string,
	output: string
): Promise<Array<{ name: string; file: string }>> {
	const components: Component[] = [];

	const allFilesAndFolders = await readDir(entry);
	const svgFiles = allFilesAndFolders.filter((file) => file.endsWith('.svg'));
	for (const svgFile of svgFiles) {
		const svgFileName = svgFile.replace(/\.svg$/, '');
		const componentName = camelCase(svgFileName, { pascalCase: true });
		const componentFileName = `${componentName}.tsx`;
		await convertSvgToReactComponent(
			path.join(entry, svgFile),
			path.resolve(output, componentFileName),
			componentName
		);
		components.push({ name: componentName, file: path.join(output, componentFileName) });
	}

	return components;
}

async function createIndexFile(components: Component[], outputDir: string): Promise<void> {
	const indexFile = path.join(outputDir, 'index.ts');
	let out = '';
	for (const component of components) {
		out += `export { default as ${component.name}} from './${component.name}';\n`;
	}
	out = prettier.format(out, prettierOptions);
	await writeFile(indexFile, out);
	await compileTsToJs([indexFile], {
		module: ts.ModuleKind.CommonJS,
		noImplicitAny: true,
		allowSyntheticDefaultImports: true,
		target: ts.ScriptTarget.ES5,
		jsx: ts.JsxEmit.ReactJSX,
		lib: ['es6', 'dom'],
		emit: ts.EmitFlags.HasEndOfDeclarationMarker,
		declaration: true,
		log: false,
	});
}

async function convertSvgToReactComponent(inputFile: string, outputFile: string, componentName: string): Promise<void> {
	const svgContent = await readFile(inputFile, 'utf8');
	let out = `
	import React from 'react';

	export interface Props {
		className?: string;
		color?: string; 
		title?: string;
	}

	const ${componentName} = ({className, color = '#262626', title}: Props) => {
		return (${svgContent});
	};
	
	export default ${componentName};
	`;

	out = convertDataAttributesToJsxAttributes(out);
	out = addProp('fill', 'color', 'path', out);
	out = addProp('className', 'className', 'svg', out);
	out = addElement('title', `{title || '${componentName} icon'}`, 'path', out);

	out = prettier.format(out, prettierOptions);
	try {
		await writeFile(outputFile, out);
	} catch (e) {
		console.error(e);
	}
}

function convertDataAttributesToJsxAttributes(svg: string): string {
	const dataAttributes = svg.match(/([a-zA-Z0-9-]+)="([^"]+)"/g);
	if (!dataAttributes) return svg;

	for (const dataAttribute of dataAttributes) {
		const [, attributeName, attributeValue] = dataAttribute.match(/([a-zA-Z0-9-]+)="([^"]+)"/)!;
		const jsxAttribute = camelCase(attributeName);
		svg = svg.replace(dataAttribute, `${jsxAttribute}="${attributeValue}"`);
	}

	return svg;
}

function addProp(propName: string, propValue: string, targetElement: string, html: string): string {
	propName = camelCase(propName);
	const fullProp = `${propName}={${propValue}}`;
	let targetHtml = html.match(new RegExp(`<${targetElement}([^>]*)>`, 'g'))![0];

	if (targetHtml.indexOf(`${propName}="`) > -1) {
		targetHtml = targetHtml.replace(new RegExp(`${propName}="[^"]+"`, 'g'), fullProp);
	} else {
		targetHtml = targetHtml.replace(new RegExp(`/>|>`, 'g'), ` ${fullProp}$&`);
	}

	html = html.replace(new RegExp(`<${targetElement}([^>]*)>`, 'g'), targetHtml);
	return html;
}

function addElement(elementName: string, elementContent: string, siblingElement: string, html: string): string {
	elementName = camelCase(elementName);
	const fullElement = `<${elementName}>${elementContent}</${elementName}>`;

	const siblingElementIndex = html.indexOf(`<${siblingElement}`);
	if (siblingElementIndex === -1) {
		return html.replace(/<\/svg>/, `${fullElement}</svg>`);
	}
	return html.replace(`<${siblingElement}`, `${fullElement}<${siblingElement}`);
}

async function compileTsToJs(fileNames: string[], options: ts.CompilerOptions): Promise<void> {
	let program = ts.createProgram(fileNames, options);
	let emitResult = program.emit();

	let allDiagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);

	allDiagnostics.forEach((diagnostic) => {
		if (diagnostic.file) {
			let { line, character } = ts.getLineAndCharacterOfPosition(diagnostic.file, diagnostic.start!);
			let message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
			console.log(`${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`);
		} else {
			console.log(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
		}
	});

	const tsFiles = program
		.getSourceFiles()
		.filter((file) => file.fileName.endsWith('.ts') || file.fileName.endsWith('.tsx'))
		.filter((file) => !file.fileName.endsWith('.d.ts'));
	for (const file of tsFiles) {
		await rm(file.fileName);
	}
}

async function setPackageJsonExports(file: string) {}
