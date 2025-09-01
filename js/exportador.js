async function exportarExcel() {
  const db = firebase.firestore();
  const snapshot = await db.collection("escrutinios").get();

  const data = [];

  snapshot.forEach(doc => {
    const d = doc.data();
    const votos = d.votos;
    const fila = {
      mesa: d.mesa,
      dni: d.dni,
      urlFoto: d.urlFoto
    };

    for (const lista in votos) {
      fila[`Dip ${lista}`] = votos[lista].diputados;
      fila[`Con ${lista}`] = votos[lista].concejales;
    }

    data.push(fila);
  });

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Resultados");

  XLSX.writeFile(wb, "resultados_fiscalizacion.xlsx");
}
