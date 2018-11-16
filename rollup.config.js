import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import pkg from './package.json';

export default [

	// {
	// 	input: 'src/main.js',
	// 	output: {
	// 		name: 'ErrorControl',
	// 		file: pkg.browser,
	// 		format: 'umd'						// browser-friendly UMD build
	// 	},
	// 	plugins: [
	// 		resolve(), // so Rollup can find `ms`
	// 		commonjs() // so Rollup can convert `ms` to an ES module
	// 	]
	// },

	// CommonJS (for Node) and ES module (for bundlers) build.
	// (We could have three entries in the configuration array
	// instead of two, but it's quicker to generate multiple
	// builds from a single configuration where possible, using
	// an array for the `output` option, where we can specify 
	// `file` and `format` for each target)
	{
		input: 'src/FirebaseExtra.js',
		//external: [],
		output: [
			{ file: pkg.main, format: 'cjs' },
			{ file: pkg.module, format: 'es' }
		]
	},
	{
		input: 'src/FirebaseExtraAdmin.js',
		//external: [],
		output: [
			{ file: 'dist/FirebaseExtraAdmin.cjs.js', format: 'cjs' },
			{ file: 'dist/FirebaseExtraAdmin.esm.js', format: 'es' }
		]
	},
	{
		input: 'src/FirebaseAdminUtils.js',
		external: ['lodash'],
		output: [
			{ file: 'dist/FirebaseAdminUtils.cjs.js', format: 'cjs' },
			{ file: 'dist/FirebaseAdminUtils.esm.js', format: 'es' }
		],
		plugins: [
			resolve(), // so Rollup can find `ms`
			commonjs() // so Rollup can convert `ms` to an ES module
		]
	}
];
