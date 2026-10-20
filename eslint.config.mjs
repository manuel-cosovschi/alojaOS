import { FlatCompat } from '@eslint/eslintrc';

/**
 * ESLint, configurado.
 *
 * Antes no estaba: `npm run lint` abría el asistente de Next —«¿cómo querés
 * configurar ESLint?»— y se quedaba esperando una tecla. O sea que el proyecto
 * tenía un script de lint que no lintea nada y que cuelga si lo corre algo que
 * no sea una persona mirando la pantalla. Un chequeo que nunca corre es peor
 * que no tenerlo, porque figura en el package.json como si corriera.
 *
 * ESLint 9 usa configuración plana, y `eslint-config-next` todavía viene en el
 * formato viejo; FlatCompat es el puente que recomienda ESLint para eso.
 */
const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

export default [
  {
    // Lo generado y lo que no es código del proyecto. `capturas.generado.ts` lo
    // escribe el script de capturas: lintearlo sería pedirle estilo a una
    // salida de máquina.
    ignores: [
      '.next/**',
      'node_modules/**',
      'respaldos/**',
      'public/**',
      'src/components/comercial/capturas.generado.ts',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // El proyecto usa `any` en los puentes con PostgREST, donde la forma de
      // la respuesta la decide la base y no el tipo. Avisa, no frena.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Un argumento con guion bajo adelante está ahí porque la firma lo pide
      // —el estado anterior de `useActionState`, por ejemplo— y no se usa a
      // propósito. Es la convención, y sin esto habría que inventarle un uso.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Los arneses son scripts de consola: imprimen, leen el entorno y tiran
    // errores a mano. Las reglas pensadas para código de la app les marcan
    // cosas que ahí son correctas.
    files: ['scripts/**/*.{ts,mts}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
