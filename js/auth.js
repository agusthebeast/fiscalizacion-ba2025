import { auth } from './firebase.js';
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const dni = document.getElementById("dni").value;
  const clave = document.getElementById("clave").value;

  const email = `${dni}@ba.com`;

  try {
    await signInWithEmailAndPassword(auth, email, clave);
    location.href = "inicio.html";
  } catch (error) {
    mostrarMensaje("Datos incorrectos");
  }
});

function mostrarMensaje(texto) {
  const box = document.getElementById("mensaje");
  const txt = document.getElementById("mensaje-texto");
  txt.textContent = texto;
  box.style.display = "flex";
}
