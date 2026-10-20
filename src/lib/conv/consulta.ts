/**
 * Los tipos de consulta del formulario de `/conv`. Aparte de la acción porque
 * un archivo `'use server'` sólo puede exportar funciones.
 */
export const TIPOS_DE_CONSULTA = {
  demo: 'Quiero que me muestren el sistema',
  precio: 'Quiero saber qué plan me conviene',
  contratar: 'Quiero contratarlo',
} as const;
