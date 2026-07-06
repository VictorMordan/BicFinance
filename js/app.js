import { auth, provider, db } from './firebase.js';
import { onAuthStateChanged, signInWithPopup, signOut } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { collection, addDoc, query, where, onSnapshot, deleteDoc, doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// --- VARIABLES DE ESTADO LOCAL ---
let usuarioActual = null;
let fechaFiltro = new Date(); // Año y mes en pantalla
let listaGastos = [];
let chartMetodosInstance = null;
let presupuestoMensual = 30000; // Por defecto si no está en Firebase
let tipoFechaSeleccionado = 'unico'; // 'unico' o 'aprox'

// --- ELEMENTOS DE LA INTERFAZ ---
const mainHeader = document.getElementById('main-header');
const seccionLogin = document.getElementById('seccion-login');
const seccionDashboard = document.getElementById('seccion-dashboard');
const btnLoginGoogle = document.getElementById('btn-login-google');
const btnLogout = document.getElementById('btn-logout');
const imgUsuario = document.getElementById('img-usuario');

const txtMesActual = document.getElementById('txt-mes-actual');
const btnMesAnterior = document.getElementById('btn-mes-anterior');
const btnMesSiguiente = document.getElementById('btn-mes-siguiente');

const txtPresupuesto = document.getElementById('txt-presupuesto');
const txtGastado = document.getElementById('txt-gastado');
const txtDisponible = document.getElementById('txt-disponible');
const barraProgreso = document.getElementById('barra-progreso');
const btnEditarPresupuesto = document.getElementById('btn-editar-presupuesto');

const filtroPrioridad = document.getElementById('filtro-prioridad');
const filtroMetodo = document.getElementById('filtro-metodo');
const tablaGastosCuerpo = document.getElementById('tabla-gastos-cuerpo');

const btnAbrirModal = document.getElementById('btn-abrir-modal');
const btnCerrarModal = document.getElementById('btn-cerrar-modal');
const modalGasto = document.getElementById('modal-gasto');
const formGasto = document.getElementById('form-gasto');

const tabDiaUnico = document.getElementById('tab-dia-unico');
const tabDiasAprox = document.getElementById('tab-dias-aprox');
const boxDiaUnico = document.getElementById('box-dia-unico');
const boxDiasAprox = document.getElementById('box-dias-aprox');


// --- AUTENTICACIÓN ---
onAuthStateChanged(auth, async (user) => {
  if (user) {
    usuarioActual = user;
    imgUsuario.src = user.photoURL || 'https://via.placeholder.com/40';
    seccionLogin.classList.add('hidden');
    seccionDashboard.classList.remove('hidden');
    btnAbrirModal.classList.remove('hidden');
    mainHeader.classList.remove('hidden');
    
    actualizarTextoFecha();
    await cargarPresupuestoDeFirebase();
    escucharGastosFirebase();
  } else {
    usuarioActual = null;
    seccionLogin.classList.remove('hidden');
    seccionDashboard.classList.add('hidden');
    btnAbrirModal.classList.add('hidden');
    mainHeader.classList.add('hidden');
    if (chartMetodosInstance) chartMetodosInstance.destroy();
  }
});

btnLoginGoogle.addEventListener('click', () => signInWithPopup(auth, provider).catch(console.error));
btnLogout.addEventListener('click', () => signOut(auth).catch(console.error));

// --- CONTROL DE NAVEGACIÓN ENTRE MESES ---
function actualizarTextoFecha() {
  const opciones = { month: 'long', year: 'numeric' };
  txtMesActual.textContent = fechaFiltro.toLocaleDateString('es-DO', opciones);
}

btnMesAnterior.addEventListener('click', async () => {
  fechaFiltro.setMonth(fechaFiltro.getMonth() - 1);
  actualizarTextoFecha();
  await cargarPresupuestoDeFirebase();
  escucharGastosFirebase();
});

btnMesSiguiente.addEventListener('click', async () => {
  fechaFiltro.setMonth(fechaFiltro.getMonth() + 1);
  actualizarTextoFecha();
  await cargarPresupuestoDeFirebase();
  escucharGastosFirebase();
});

// --- LÓGICA EXCLUSIVA DEL PRESUPUESTO (FIRESTORE) ---
async function cargarPresupuestoDeFirebase() {
  if (!usuarioActual) return;
  const anio = fechaFiltro.getFullYear();
  const mes = String(fechaFiltro.getMonth() + 1).padStart(2, '0');
  const idDocumento = `${anio}-${mes}`;

  const docRef = doc(db, "usuarios", usuarioActual.uid, "presupuestos", idDocumento);
  try {
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      presupuestoMensual = docSnap.data().monto;
    } else {
      presupuestoMensual = 30000; // Valor base restaurado si cambias a un mes nuevo sin presupuesto
    }
    txtPresupuesto.textContent = formatearMoneda(presupuestoMensual);
    recalcularYRenderizar();
  } catch (error) {
    console.error("Error al leer presupuesto:", error);
  }
}

btnEditarPresupuesto.addEventListener('click', async () => {
  const nuevoValor = prompt("Introduce el presupuesto asignado para este mes:", presupuestoMensual);
  if (nuevoValor !== null && !isNaN(nuevoValor) && nuevoValor.trim() !== "") {
    const montoNumerico = parseFloat(nuevoValor);
    if (montoNumerico >= 0) {
      const anio = fechaFiltro.getFullYear();
      const mes = String(fechaFiltro.getMonth() + 1).padStart(2, '0');
      const idDocumento = `${anio}-${mes}`;
      
      const docRef = doc(db, "usuarios", usuarioActual.uid, "presupuestos", idDocumento);
      try {
        await setDoc(docRef, { monto: montoNumerico });
        presupuestoMensual = montoNumerico;
        txtPresupuesto.textContent = formatearMoneda(presupuestoMensual);
        recalcularYRenderizar();
      } catch (error) {
        alert("Error guardando el presupuesto.");
      }
    }
  }
});

// --- CONEXIÓN DE GASTOS EN TIEMPO REAL ---
let unsubscribeGastos = null;
function escucharGastosFirebase() {
  if (unsubscribeGastos) unsubscribeGastos();
  if (!usuarioActual) return;

  const anio = fechaFiltro.getFullYear();
  const mes = String(fechaFiltro.getMonth() + 1).padStart(2, '0');

  const q = query(
    collection(db, "usuarios", usuarioActual.uid, "gastos"),
    where("anio", "==", anio),
    where("mes", "==", mes)
  );

  unsubscribeGastos = onSnapshot(q, (snapshot) => {
    listaGastos = [];
    snapshot.forEach((doc) => {
      listaGastos.push({ id: doc.id, ...doc.data() });
    });
    recalcularYRenderizar();
  }, console.error);
}

// --- RENDERS, TOTALES Y CAMBIO A BARRA ROJA ---
function recalcularYRenderizar() {
  const pSel = filtroPrioridad.value;
  const mSel = filtroMetodo.value;

  // Filtrado de la lista en memoria
  const gastosFiltrados = listaGastos.filter(g => {
    const pMatch = pSel === 'todos' || g.prioridad === pSel;
    const mMatch = mSel === 'todos' || g.metodoPago === mSel;
    return pMatch && mMatch;
  });

  // Totales basados siempre en todos los gastos del mes real
  const totalGastado = listaGastos.reduce((sum, g) => sum + g.monto, 0);
  const totalDisponible = presupuestoMensual - totalGastado;

  // Pintar paneles
  txtGastado.textContent = formatearMoneda(totalGastado);
  txtDisponible.textContent = formatearMoneda(totalDisponible);
  
  if (totalDisponible < 0) {
    txtDisponible.className = "text-xl sm:text-2xl font-bold text-red-600 mt-1";
  } else {
    txtDisponible.className = "text-xl sm:text-2xl font-bold text-emerald-600 mt-1";
  }

  // REQUISITO 1: Cambio del color de la barra a Rojo al exceder el límite
  const pct = presupuestoMensual > 0 ? Math.min((totalGastado / presupuestoMensual) * 100, 100) : 0;
  barraProgreso.style.width = `${pct}%`;
  if (totalGastado > presupuestoMensual) {
    barraProgreso.className = "bg-red-500 h-full transition-all duration-500";
  } else {
    barraProgreso.className = "bg-emerald-500 h-full transition-all duration-500";
  }

  // Pintar tabla e historial de gráficos
  renderTablaHTML(gastosFiltrados);
  renderGraficoMetodos();
}

function renderTablaHTML(gastos) {
  tablaGastosCuerpo.innerHTML = '';
  if (gastos.length === 0) {
    tablaGastosCuerpo.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-gray-400 italic">No hay registros para mostrar</td></tr>`;
    return;
  }

  // Ordenar gastos del día mayor al menor
  gastos.sort((a, b) => {
    const diaA = parseInt(a.fechaFormateada.split('-')[0]) || 0;
    const diaB = parseInt(b.fechaFormateada.split('-')[0]) || 0;
    return diaB - diaA;
  });

  gastos.forEach(g => {
    const tr = document.createElement('tr');
    tr.className = "hover:bg-gray-50/70 transition-colors";

    // Badge Prioridad
    let badgeColor = "bg-gray-100 text-gray-600";
    if (g.prioridad === 'Alta') badgeColor = "bg-red-50 text-red-600 border border-red-100";
    if (g.prioridad === 'Media') badgeColor = "bg-amber-50 text-amber-600 border border-amber-100";
    if (g.prioridad === 'Baja') badgeColor = "bg-blue-50 text-blue-600 border border-blue-100";

    // Icono Pago
    let iconoPago = '<i class="fas fa-wallet mr-1.5 opacity-70"></i>';
    if (g.metodoPago === 'Débito') iconoPago = '<i class="fas fa-credit-card text-blue-500 mr-1.5"></i>';
    if (g.metodoPago === 'Crédito') iconoPago = '<i class="fas fa-credit-card text-purple-500 mr-1.5"></i>';
    if (g.metodoPago === 'Efectivo') iconoPago = '<i class="fas fa-money-bill-wave text-emerald-500 mr-1.5"></i>';

    tr.innerHTML = `
      <td class="px-4 py-3.5 font-medium text-gray-900">${g.descripcion}</td>
      <td class="px-4 py-3.5 text-gray-500">${g.fechaFormateada}</td>
      <td class="px-4 py-3.5"><span class="px-2.5 py-0.5 rounded-full text-xs font-semibold ${badgeColor}">${g.prioridad}</span></td>
      <td class="px-4 py-3.5 inline-flex items-center text-gray-600 mt-1">${iconoPago} ${g.metodoPago}</td>
      <td class="px-4 py-3.5 text-right font-bold text-gray-800">${formatearMoneda(g.monto)}</td>
      <td class="px-4 py-3.5 text-center">
        <button data-id="${g.id}" class="btn-eliminar text-gray-300 hover:text-red-500 transition-colors p-1 cursor-pointer">
          <i class="fas fa-times"></i>
        </button>
      </td>
    `;
    tablaGastosCuerpo.appendChild(tr);
  });

  // Listeners de eliminación
  document.querySelectorAll('.btn-eliminar').forEach(b => {
    b.addEventListener('click', async (e) => {
      const idGasto = e.currentTarget.getAttribute('data-id');
      if (confirm("¿Seguro que deseas eliminar este gasto?") && usuarioActual) {
        await deleteDoc(doc(db, "usuarios", usuarioActual.uid, "gastos", idGasto)).catch(console.error);
      }
    });
  });
}

function renderGraficoMetodos() {
  const totales = { Débito: 0, Crédito: 0, Efectivo: 0 };
  listaGastos.forEach(g => { if (totales[g.metodoPago] !== undefined) totales[g.metodoPago] += g.monto; });

  const total = totales.Débito + totales.Crédito + totales.Efectivo;
  const ctx = document.getElementById('chart-metodos');
  const placeholder = document.getElementById('chart-placeholder');

  if (total === 0) {
    ctx.classList.add('hidden');
    placeholder.classList.remove('hidden');
    if (chartMetodosInstance) chartMetodosInstance.destroy();
    return;
  }

  ctx.classList.remove('hidden');
  placeholder.classList.add('hidden');

  const dataValues = [totales.Débito, totales.Crédito, totales.Efectivo];

  if (chartMetodosInstance) {
    chartMetodosInstance.data.datasets[0].data = dataValues;
    chartMetodosInstance.update();
  } else {
    chartMetodosInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Débito', 'Crédito', 'Efectivo'],
        datasets: [{
          data: dataValues,
          backgroundColor: ['#3b82f6', '#8b5cf6', '#10b981'],
          borderWidth: 2,
          borderColor: '#ffffff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
        cutout: '70%'
      }
    });
  }
}

// --- ESCUCHADORES DE LOS SELECTS FILTROS ---
filtroPrioridad.addEventListener('change', recalcularYRenderizar);
filtroMetodo.addEventListener('change', recalcularYRenderizar);

// --- MODAL ACCIONES Y SELECTOR DE FECHAS ---
btnAbrirModal.addEventListener('click', () => {
  formGasto.reset();
  setearTipoFecha('unico');
  
  // Rellenar automáticamente campos de día para guiar al usuario
  const diaHoy = new Date().getDate();
  document.getElementById('in-dia-unico').value = diaHoy;
  document.getElementById('in-dia-desde').value = diaHoy;
  document.getElementById('in-dia-hasta').value = Math.min(diaHoy + 3, 31);
  
  modalGasto.classList.remove('hidden');
});

btnCerrarModal.addEventListener('click', () => modalGasto.classList.add('hidden'));

tabDiaUnico.addEventListener('click', () => setearTipoFecha('unico'));
tabDiasAprox.addEventListener('click', () => setearTipoFecha('aprox'));

function setearTipoFecha(tipo) {
  tipoFechaSeleccionado = tipo;
  if (tipo === 'unico') {
    tabDiaUnico.className = "py-2 text-center rounded-lg font-medium bg-white shadow-xs text-blue-600 transition-all cursor-pointer";
    tabDiasAprox.className = "py-2 text-center rounded-lg font-medium text-gray-500 hover:text-gray-700 transition-all cursor-pointer";
    boxDiaUnico.classList.remove('hidden');
    boxDiasAprox.classList.add('hidden');
  } else {
    tabDiasAprox.className = "py-2 text-center rounded-lg font-medium bg-white shadow-xs text-blue-600 transition-all cursor-pointer";
    tabDiaUnico.className = "py-2 text-center rounded-lg font-medium text-gray-500 hover:text-gray-700 transition-all cursor-pointer";
    boxDiasAprox.classList.remove('hidden');
    boxDiaUnico.classList.add('hidden');
  }
}

// --- GUARDAR GASTO EN FIRESTORE ---
formGasto.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!usuarioActual) return;

  const descripcion = document.getElementById('in-descripcion').value.trim();
  const monto = parseFloat(document.getElementById('in-monto').value);
  const metodoPago = document.getElementById('in-metodo').value;
  const prioridad = document.getElementById('in-prioridad').value;

  const anio = fechaFiltro.getFullYear();
  const mesNum = fechaFiltro.getMonth() + 1;
  const mesString = String(mesNum).padStart(2, '0');

  let fechaFormateada = '';

  if (tipoFechaSeleccionado === 'unico') {
    const dia = parseInt(document.getElementById('in-dia-unico').value) || 1;
    fechaFormateada = `${String(dia).padStart(2, '0')}`;
  } else {
    const desde = parseInt(document.getElementById('in-dia-desde').value) || 1;
    const hasta = parseInt(document.getElementById('in-dia-hasta').value) || 1;
    fechaFormateada = `${String(desde).padStart(2, '0')} - ${String(hasta).padStart(2, '0')}`;
  }

  const nuevoGasto = {
    descripcion,
    monto,
    metodoPago,
    prioridad,
    anio,
    mes: mesString,
    fechaFormateada,
    creadoEn: new Date().getTime()
  };

  try {
    await addDoc(collection(db, "usuarios", usuarioActual.uid, "gastos"), nuevoGasto);
    modalGasto.classList.add('hidden');
    formGasto.reset();
  } catch (error) {
    console.error("Error guardando gasto:", error);
    alert("Hubo un error al procesar el gasto.");
  }
});

// --- AYUDANTE DE MONEDA ---
function formatearMoneda(valor) {
  return `RD$${valor.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}