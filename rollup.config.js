import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import pkg from './package.json';

export default [

	{
		input: 'src/FirebaseExtra.js',
		external: ['error-control'],
		output: [
			{ file: pkg.main, format: 'cjs' },
			{ file: pkg.module, format: 'es' }
		]
	},
	{
		input: 'src/FirebaseAdminUtils.js',
		external: ['lodash','error-control'],
		output: [
			{ file: 'dist/cjs/FirebaseAdminUtils.js', format: 'cjs' },
			{ file: 'dist/es/FirebaseAdminUtils.js', format: 'es' }
		],
		plugins: [
			resolve(), // so Rollup can find `ms`
			commonjs() // so Rollup can convert `ms` to an ES module
		]
	},
	{
		input: 'src/FirebaseExtraAdmin.js',
		external: ['error-control','./FirebaseExtra','./FirebaseAdminUtils'],
		output: [
			{ file: 'dist/cjs/FirebaseExtraAdmin.js', format: 'cjs' },
			{ file: 'dist/es/FirebaseExtraAdmin.js', format: 'es' }
		]
	}
];
