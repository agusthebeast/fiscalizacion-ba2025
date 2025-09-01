const firebaseConfig = {
  apiKey: "AIzaSyBBzTZfg0OfP0ESC6Gm3YixAmumVtGqjq0",
  authDomain: "fiscalizacionba2025.firebaseapp.com",
  projectId: "fiscalizacionba2025",
};

firebase.initializeApp(firebaseConfig);

function login() {
  const dni = document.getElementById("dni").value.trim();
  const password = document.getElementById("password").value.trim();

  if (!dni || !password) {
    document.getElementById("login-error").innerText = "Completa todos los campos.";
    return;
  }

  const email = `${dni}@fiscales.com`;

  firebase.auth().signInWithEmailAndPassword(email, password)
    .then(() => {
      window.location.href = "pages/a8Lp3Nw.html"; // página del menú, se reemplazará por nombre aleatorio luego
    })
    .catch(() => {
      document.getElementById("login-error").innerText = "Datos incorrectos.";
    });
}
