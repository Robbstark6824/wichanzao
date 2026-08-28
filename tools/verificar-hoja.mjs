// Comprueba el estado de la hoja tras el borrado: que el bloque histórico siga
// intacto y que solo haya desaparecido la fila del bloque GERESA.
const CSV = 'https://docs.google.com/spreadsheets/d/1nEBcVRH1o3_9luexxiV_ur-CupmRX_H6qeNn4BElxzU/export?format=csv';

const r = await fetch(CSV);          // fetch sigue los redirects; curl sin -L no
console.log('HTTP ' + r.status);
const filas = (await r.text()).split('\n');
console.log('Filas en la hoja: ' + filas.length + '\n');

const buscar = (txt) => {
  console.log('--- "' + txt + '" ---');
  let n = 0;
  filas.forEach((l, i) => {
    if (l.toUpperCase().includes(txt.toUpperCase())) { n++; console.log('  fila ' + (i + 1) + ': ' + l.slice(0, 120)); }
  });
  if (!n) console.log('  (sin coincidencias)');
  console.log('');
};

buscar('OTINIANO');
buscar('70515665');
buscar('GUZM');
buscar('XIMENA');
