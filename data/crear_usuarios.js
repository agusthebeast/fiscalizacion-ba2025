const admin = require("firebase-admin");
const fs = require("fs");

const usuarios = JSON.parse(fs.readFileSync("fiscales.json", "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(require("./credencial.json")),
});

async function crearUsuarios() {
  for (const fiscal of usuarios) {
    const email = `${fiscal.dni}@fiscales.com`;
    const password = fiscal.dni.slice(-4);

    try {
      await admin.auth().createUser({ email, password });
      console.log("✅ Usuario creado:", email);
    } catch (e) {
      console.log("⚠️ Ya existe:", email);
    }
  }
}

crearUsuarios();
