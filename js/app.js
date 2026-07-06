// ==========================================================================
// 1. IMPORTACIONES
// ==========================================================================
import { auth, provider, db, trackearAccion } from './firebase.js';
import { signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ==========================================================================
// 2. ESTADO GLOBAL DE LA APLICACIÓN
// ==========================================================================
let usuarioActivo = null;
let fechaActual = new Date(); // Controla el mes y año en pantalla
let listaGastos = [];        // Guarda los gastos del mes actual
let miGrafico = null;        // Instancia del gráfico Chart.js
let desuscribirRealtime = null; // Función para apagar el escuchador de Firebase al cerrar sesión

const PRESUPUESTO_MENSUAL = 30000.00; // Copiamos el presupuesto base de tu diseño

// ==========================================================================
// 3. SELECTORES DEL DOM
// ==========================================================================
const eLoginScreen = document.getElementById('login-screen');
const eAppScreen = document.getElementById('app-screen');
const eBtnLogin = document.getElementById('btn-login');
const eBtnLogout = document.getElementById('btn-logout');
const eUserAvatar = document.getElementById('user-avatar');

const eCurrentMonthDisplay = document.getElementById('current-month-display');
const eBtnPrevMonth = document.getElementById('prev-month');
const eBtnNextMonth = document.getElementById('next-month');

const eTxtBudget = document.getElementById('txt-budget');
const eTxtSpent = document.getElementById('txt-spent');
const eTxtAvailable = document.getElementById('txt-available');
const eProgressSpent = document.getElementById('progress-spent');

const eFilterPriority = document.getElementById('filter-priority');
const eFilterMethod = document.getElementById('filter-method');
const eExpensesList = document.getElementById('expenses-list');

const eBtnOpenModal = document.getElementById('btn-open-modal');
const eBtnCloseModal = document.getElementById('btn-close-modal');
const eExpenseModal = document.getElementById('expense-modal');
const eExpenseForm = document.getElementById('expense-form');

// ==========================================================================
// 4. CONTROL DE FLUJO Y AUTENTICACIÓN
// ==========================================================================
onAuthStateChanged(auth, (user) => {
    if (user) {
        usuarioActivo = user;
        eUserAvatar.src = user.photoURL || 'https://via.placeholder.com/150';
        
        // Cambiar de pantalla
        eLoginScreen.classList.add('hidden');
        eAppScreen.classList.remove('hidden');
        
        trackearAccion('sesion_iniciada', { email: user.email });
        
        // Inicializar interfaz
        actualizarFiltrosYMes();
        conectarFirestore();
    } else {
        usuarioActivo = null;
        if (desuscribirRealtime) desuscribirRealtime();
        
        eAppScreen.classList.add('hidden');
        eLoginScreen.classList.remove('hidden');
    }
});

// Eventos de Auth
eBtnLogin.addEventListener('click', async () => {
    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error("Error al iniciar sesión con Google:", error);
    }
});

eBtnLogout.addEventListener('click', () => {
    signOut(auth).catch(error => console.error("Error al cerrar sesión:", error));
});

// ==========================================================================
// 5. MANEJO DE FECHAS (SELECTOR DE MESES)
// ==========================================================================
function actualizarFiltrosYMes() {
    const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    const mesTexto = meses[fechaActual.getMonth()];
    const anio = fechaActual.getFullYear();
    
    eCurrentMonthDisplay.textContent = `${mesTexto} ${anio}`;
}

eBtnPrevMonth.addEventListener('click', () => {
    fechaActual.setMonth(fechaActual.getMonth() - 1);
    actualizarFiltrosYMes();
    conectarFirestore();
});

eBtnNextMonth.addEventListener('click', () => {
    fechaActual.setMonth(fechaActual.getMonth() + 1);
    actualizarFiltrosYMes();
    conectarFirestore();
});

// ==========================================================================
// 6. CONEXIÓN A FIRESTORE (TIEMPO REAL)
// ==========================================================================
function conectarFirestore() {
    if (!usuarioActivo) return;
    if (desuscribirRealtime) desuscribirRealtime();

    // Ruta segura estructurada según nuestras reglas: users/UID/gastos
    const coleccionRef = collection(db, 'users', usuarioActivo.uid, 'gastos');
    const consultaOrdenada = query(coleccionRef, orderBy('fechaCreacion', 'desc'));

    desuscribirRealtime = onSnapshot(consultaOrdenada, (snapshot) => {
        const todosLosGastos = [];
        snapshot.forEach((doc) => {
            todosLosGastos.push({ id: doc.id, ...doc.data() });
        });

        // Filtrar los datos en el cliente para que correspondan al mes y año seleccionados
        const mesSeleccionado = fechaActual.getMonth();
        const anioSeleccionado = fechaActual.getFullYear();

        listaGastos = todosLosGastos.filter(gasto => {
            const fechaGasto = new Date(gasto.fecha);
            // Sumamos un desfase si es necesario por zonas horarias del input date
            const UTCFecha = new Date(fechaGasto.getTime() + fechaGasto.getTimezoneOffset() * 60000);
            return UTCFecha.getMonth() === mesSeleccionado && UTCFecha.getFullYear() === anioSeleccionado;
        });

        procesarYRenderizar();
    }, (error) => {
        console.error("Error leyendo Firestore: ", error);
    });
}

// ==========================================================================
// 7. CÁLCULOS, RENDERIZADO Y FILTROS
// ==========================================================================
function procesarYRenderizar() {
    // 1. Filtrado segun los Selects de la tabla
    const filtroPrioridad = eFilterPriority.value;
    const filtroMetodo = eFilterMethod.value;

    const gastosFiltrados = listaGastos.filter(gasto => {
        const cumplePrioridad = (filtroPrioridad === 'all' || gasto.prioridad === filtroPrioridad);
        const cumpleMetodo = (filtroMetodo === 'all' || gasto.metodoPago === filtroMetodo);
        return cumplePrioridad && cumpleMetodo;
    });

    // 2. Calcular Métricas de las Tarjetas (Usamos el total mensual sin filtrar para las cards)
    const totalGastadoMes = listaGastos.reduce((total, gasto) => total + gasto.monto, 0);
    const totalDisponible = PRESUPUESTO_MENSUAL - totalGastadoMes;

    // Formateador de moneda dominicana
    const formatoMoneda = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' });

    eTxtBudget.textContent = formatoMoneda.format(PRESUPUESTO_MENSUAL);
    eTxtSpent.textContent = formatoMoneda.format(totalGastadoMes);
    eTxtAvailable.textContent = formatoMoneda.format(totalDisponible);

    // Actualizar barra de progreso visual
    const porcentajeProgreso = Math.min((totalGastadoMes / PRESUPUESTO_MENSUAL) * 100, 100);
    eProgressSpent.style.width = `${porcentajeProgreso}%`;

    // 3. Pintar la Tabla de Gastos
    eExpensesList.innerHTML = '';
    
    if (gastosFiltrados.length === 0) {
        eExpensesList.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">No hay gastos registrados con estos criterios.</td></tr>`;
    } else {
        gastosFiltrados.forEach(gasto => {
            const fila = document.createElement('tr');
            
            // Ajustar formato visual de la fecha corta (ej. "22 - 25") si es aproximada
            let fechaDisplay = gasto.fecha.split('-')[2]; // toma el día por defecto
            if (gasto.tipoFecha === 'approx' && gasto.fechaHasta) {
                const diaInicio = gasto.fecha.split('-')[2];
                const diaFin = gasto.fechaHasta.split('-')[2];
                fechaDisplay = `${diaInicio} - ${diaFin}`;
            }

            fila.innerHTML = `
                <td>${gasto.descripcion}</td>
                <td>${fechaDisplay}</td>
                <td><span class="badge ${gasto.prioridad.toLowerCase()}">${gasto.prioridad}</span></td>
                <td><i class="fas ${obtenerIconoPago(gasto.metodoPago)}"></i> ${gasto.metodoPago}</td>
                <td style="font-weight:600;">${formatoMoneda.format(gasto.monto)}</td>
                <td><button class="btn-delete-expense" data-id="${gasto.id}"><i class="fas fa-times"></i></button></td>
            `;
            eExpensesList.appendChild(fila);
        });

        // Asignar eventos de eliminación a los nuevos botones generados
        document.querySelectorAll('.btn-delete-expense').forEach(boton => {
            boton.addEventListener('click', eliminarGasto);
        });
    }

    // 4. Actualizar Gráfico de Dona (Agrupado por método de pago del mes completo)
    actualizarGraficoDona();
}

function obtenerIconoPago(metodo) {
    if (metodo === 'Débito') return 'fa-university';
    if (metodo === 'Crédito') return 'fa-credit-card';
    return 'fa-money-bill-wave';
}

// Escuchar cambios en los selects de filtrado
eFilterPriority.addEventListener('change', procesarYRenderizar);
eFilterMethod.addEventListener('change', procesarYRenderizar);

// ==========================================================================
// 8. MANEJO DEL GRÁFICO (CHART.JS)
// ==========================================================================
function actualizarGraficoDona() {
    // Agrupar montos por método de pago
    const totalesPorMetodo = { 'Débito': 0, 'Crédito': 0, 'Efectivo': 0 };
    
    listaGastos.forEach(gasto => {
        if (totalesPorMetodo[gasto.metodoPago] !== undefined) {
            totalesPorMetodo[gasto.metodoPago] += gasto.monto;
        }
    });

    const datosGrafico = [totalesPorMetodo['Débito'], totalesPorMetodo['Crédito'], totalesPorMetodo['Efectivo']];

    if (miGrafico) {
        // Si el gráfico ya existe, solo actualizamos sus datos para evitar parpadeos
        miGrafico.data.datasets[0].data = datosGrafico;
        miGrafico.update();
    } else {
        // Si no existe, creamos la instancia en nuestro canvas
        const ctx = document.getElementById('paymentChart').getContext('2d');
        miGrafico = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Débito', 'Crédito', 'Efectivo'],
                datasets: [{
                    data: datosGrafico,
                    backgroundColor: ['#1d4ed8', '#3b82f6', '#10b981'], // Tonos azul, azul claro y verde de tu paleta
                    borderWidth: 2,
                    borderColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 12 } } }
                },
                cutout: '70%' // Hace que la dona se vea delgada y elegante como en tu prototipo
            }
        });
    }
}

// ==========================================================================
// 9. ACCIONES: LOGICA DE MODAL Y GUARDADO/BORRADO
// ==========================================================================

// Abrir y cerrar formulario flotante
eBtnOpenModal.addEventListener('click', () => {
    eExpenseForm.reset();
    // Establecer la fecha de hoy por defecto en el input
    document.getElementById('input-date').value = new Date().toISOString().split('T')[0];
    eExpenseModal.classList.remove('hidden');
});

eBtnCloseModal.addEventListener('click', () => eExpenseModal.classList.add('hidden'));

// Control dinámico de la interfaz si eligen "Día aproximado"
document.querySelectorAll('input[name="date-type"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        let inputHasta = document.getElementById('input-date-hasta');
        if (e.target.value === 'approx') {
            if (!inputHasta) {
                // Creamos dinámicamente un campo "Hasta" si eligen aproximado
                const contenedorFecha = eExpenseForm.querySelector('#input-date').parentNode;
                const nuevoGrupo = document.createElement('div');
                nuevoGrupo.id = 'group-date-hasta';
                nuevoGrupo.style.marginTop = '8px';
                nuevoGrupo.innerHTML = `
                    <label for="input-date-hasta">Hasta</label>
                    <input type="date" id="input-date-hasta" required>
                `;
                contenedorFecha.appendChild(nuevoGrupo);
            }
        } else {
            const elementoABorrar = document.getElementById('group-date-hasta');
            if (elementoABorrar) elementoABorrar.remove();
        }
    });
});

// Guardar nuevo registro en Firestore
eExpenseForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!usuarioActivo) return;

    const tipoFecha = eExpenseForm.elements['date-type'].value;
    const inputHasta = document.getElementById('input-date-hasta');

    const nuevoGasto = {
        descripcion: document.getElementById('input-description').value,
        monto: parseFloat(document.getElementById('input-amount').value),
        tipoFecha: tipoFecha,
        fecha: document.getElementById('input-date').value,
        fechaHasta: inputHasta ? inputHasta.value : null,
        prioridad: document.getElementById('select-priority').value,
        metodoPago: document.getElementById('select-method').value,
        fechaCreacion: new Date().toISOString() // Para mantener un orden estricto de inserción
    };

    try {
        const coleccionRef = collection(db, 'users', usuarioActivo.uid, 'gastos');
        await addDoc(coleccionRef, nuevoGasto);
        
        trackearAccion('gasto_creado', { prioridad: nuevoGasto.prioridad, metodo: nuevoGasto.metodoPago });
        
        eExpenseModal.classList.add('hidden');
        eExpenseForm.reset();
        
        // Quitar el input dinámico si existía
        const elementoABorrar = document.getElementById('group-date-hasta');
        if (elementoABorrar) elementoABorrar.remove();

    } catch (error) {
        console.error("Error guardando el gasto:", error);
        alert("Hubo un problema al guardar. Inténtalo de nuevo.");
    }
});

// Eliminar registro de Firestore
async function eliminarGasto(e) {
    const idDocumento = e.currentTarget.getAttribute('data-id');
    if (!usuarioActivo || !idDocumento) return;

    if (confirm("¿Estás seguro de que deseas eliminar este gasto?")) {
        try {
            const docRef = doc(db, 'users', usuarioActivo.uid, 'gastos', idDocumento);
            await deleteDoc(docRef);
            trackearAccion('gasto_eliminado');
        } catch (error) {
            console.error("Error eliminando documento:", error);
        }
    }
}