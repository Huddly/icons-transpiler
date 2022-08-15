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
	if (!(await exists(outputDir))) {
		await mkdir(outputDir);
	}

	const folders = ['.'];
	const allFilesAndFolders = await readDir(options.entry);
	const generatedFiles = [];
	const generatedIndexFiles = [];
	folders.push(...allFilesAndFolders.filter((file) => fs.lstatSync(path.join(options.entry, file)).isDirectory()));

	const duplicateFolderNames = folders.find((folder) => path.resolve(folder) === path.resolve(options.entry));
	if (duplicateFolderNames) {
		throw new Error(`${duplicateFolderNames}: Path can't be the same as the entry folder`);
	}

	for (const folder of folders) {
		const files = await readDir(path.join(options.entry, folder));

		const svgFiles = files.filter((file) => file.endsWith('.svg'));
		if (!svgFiles.length) continue;

		if (folder !== '.') {
			if (await exists(path.resolve(options.output, folder))) {
				await rm(path.resolve(options.output, folder), { recursive: true });
			}
			await mkdir(path.resolve(options.output, folder));
		}

		const components = await convertAllSvgsToReactComponent(
			path.join(options.entry, folder),
			path.join(options.output, folder)
		);
		generatedFiles.push(...components);

		const indexFilePath = await createIndexFile(components, path.resolve(options.output, folder));
		generatedIndexFiles.push(indexFilePath);
	}

	compileTsToJs(generatedIndexFiles, {
		allowSyntheticDefaultImports: true,
		declaration: true,
		jsx: ts.JsxEmit.ReactJSX,
		module: ts.ModuleKind.CommonJS,
		target: ts.ScriptTarget.ES5,
	});

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

async function createIndexFile(components: Component[], outputDir: string): Promise<string> {
	const indexFile = path.join(outputDir, 'index.ts');
	let out = '';
	for (const component of components) {
		out += `export { default as ${component.name}} from './${component.name}';\n`;
	}
	out = prettier.format(out, prettierOptions);
	await writeFile(indexFile, out);
	return indexFile;
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

function compileTsToJs(fileNames: string[], options: ts.CompilerOptions): string[] {
	options.listEmittedFiles = true;
	const program = ts.createProgram(fileNames, options);
	const emitResult = program.emit();

	const allDiagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);
	allDiagnostics.forEach((diagnostic) => {
		if (diagnostic.file) {
			let { line, character } = ts.getLineAndCharacterOfPosition(diagnostic.file, diagnostic.start!);
			let message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
			console.log(`${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`);
		} else {
			console.log(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
		}
	});

	return emitResult.emittedFiles;
}
