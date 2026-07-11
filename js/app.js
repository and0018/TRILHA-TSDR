// js/app.js
// Lógica Principal da Aplicação (Trail Event Management System)

class TrailApp {
  constructor() {
    this.selectedVehicle = 'Moto';
    this.selectedPrice = 70.00;
    this.idPhotoFile = null;
    this.receiptFile = null;
    this.currentFilter = 'All';
    this.allRegistrations = [];
    this.currentParticipant = null;
  }

  // Inicialização Geral da App
  async init() {
    console.log("Inicializando TrailApp...");
    
    // 1. Inicializa Ícones Lucide
    lucide.createIcons();

    // 2. Conecta ao Banco de Dados (IndexedDB / Firebase)
    try {
      await window.db.init();
      this.updateDbStatusBadge();
    } catch (err) {
      this.showToast("Falha ao inicializar banco de dados local. Recarregue a página.", "error");
    }

    // 3. Registra Máscara no campo de Telefone
    const phoneInput = document.getElementById('phone');
    if (phoneInput) {
      phoneInput.addEventListener('input', (e) => {
        let val = e.target.value.replace(/\D/g, '');
        if (val.length > 11) val = val.substring(0, 11);
        
        if (val.length > 10) {
          // Celulares: (XX) XXXXX-XXXX
          e.target.value = `(${val.substring(0, 2)}) ${val.substring(2, 7)}-${val.substring(7)}`;
        } else if (val.length > 6) {
          // Fixo: (XX) XXXX-XXXX
          e.target.value = `(${val.substring(0, 2)}) ${val.substring(2, 6)}-${val.substring(6)}`;
        } else if (val.length > 2) {
          e.target.value = `(${val.substring(0, 2)}) ${val.substring(2)}`;
        } else if (val.length > 0) {
          e.target.value = `(${val}`;
        } else {
          e.target.value = '';
        }
      });
    }

    // 4. Se o admin já estiver logado (em reloads), permite manter a sessão
    if (await window.auth.isAdminLoggedIn()) {
      document.getElementById('admin-access-btn').classList.add('hidden');
      document.getElementById('admin-logout-btn').classList.remove('hidden');
      document.getElementById('admin-logout-btn').classList.add('flex');
      await this.showView('admin');
    } else {
      // 5. Exibe a tela inicial padrão (Landing)
      await this.showView('landing');
    }
  }

  // Alterna entre as Telas da Single Page Application (SPA)
  async showView(viewName) {
    const views = ['landing', 'registration', 'admin'];
    views.forEach(v => {
      const el = document.getElementById(`view-${v}`);
      if (el) {
        if (v === viewName) {
          el.classList.remove('hidden');
          el.classList.add('animate-fade-in');
        } else {
          el.classList.add('hidden');
        }
      }
    });

    // Pós-carregamento específico de tela
    if (viewName === 'admin') {
      if (!await window.auth.isAdminLoggedIn()) {
        this.openAdminAccess();
      } else {
        this.refreshDashboard();
      }
    } else if (viewName === 'landing') {
      // Força scroll para o topo ao voltar
      window.scrollTo(0, 0);
    } else if (viewName === 'registration') {
      window.scrollTo(0, 0);
      this.setupRegistrationView();
    }

    // Atualiza ícones gerados dinamicamente
    lucide.createIcons();
  }

  // Atualiza o indicador visual do banco de dados na Navbar
  updateDbStatusBadge() {
    const badge = document.getElementById('db-status-badge');
    const dot = document.getElementById('db-status-dot');
    const text = document.getElementById('db-status-text');

    if (!badge) return;
    badge.classList.remove('hidden');

    if (window.db.isSupabaseActive()) {
      dot.className = 'w-1.5 h-1.5 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(242,116,5,0.7)]';
      text.innerText = 'Supabase Nuvem';
      text.className = 'text-orange-400 font-medium';
    } else {
      dot.className = 'w-1.5 h-1.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.7)]';
      text.innerText = 'Modo Local (IndexedDB)';
      text.className = 'text-amber-400 font-medium';
    }
  }

  // Lê a categoria escolhida na Landing Page e prepara o formulário
  proceedToRegistration() {
    const selectedRadio = document.querySelector('input[name="vehicle-select"]:checked');
    if (selectedRadio) {
      this.selectedVehicle = selectedRadio.value;
      this.selectedPrice = parseFloat(selectedRadio.getAttribute('data-price'));
    }
    this.showView('registration');
  }

  // Prepara as informações dinâmicas do formulário de inscrição
  setupRegistrationView() {
    document.getElementById('form-vehicle-name').innerText = this.selectedVehicle;
    document.getElementById('form-vehicle-price').innerText = `R$ ${this.selectedPrice.toFixed(2).replace('.', ',')}`;

    // Pix instruções
    document.getElementById('pix-instruction-category').innerText = this.selectedVehicle;
    document.getElementById('pix-instruction-price').innerText = `R$ ${this.selectedPrice.toFixed(2).replace('.', ',')}`;

    // Altera o ícone de categoria dinamicamente
    const iconWrapper = document.getElementById('selected-vehicle-icon-wrapper');
    const icons = {
      'Moto': 'bike',
      'Quadriciclo': 'zap',
      'UTV': 'shield',
      'Jeep': 'truck',
      'Carona/Zeca': 'users'
    };
    iconWrapper.innerHTML = `<i data-lucide="${icons[this.selectedVehicle] || 'bike'}" class="w-5 h-5"></i>`;
    lucide.createIcons();

    // Limpa formulário anterior e previews
    document.getElementById('registration-form').reset();
    this.idPhotoFile = null;
    this.receiptFile = null;

    document.getElementById('id-preview-container').classList.add('hidden');
    document.getElementById('id-upload-placeholder').classList.remove('hidden');
    document.getElementById('receipt-preview-container').classList.add('hidden');
    document.getElementById('receipt-upload-placeholder').classList.remove('hidden');

    // Remove classes de erro
    const errorPs = document.querySelectorAll('[id^="error-"]');
    errorPs.forEach(p => p.classList.add('hidden'));
    const inputs = document.querySelectorAll('input');
    inputs.forEach(i => i.classList.remove('border-red-500'));
  }

  // Exibe preview da foto carregada no formulário
  previewImage(input, previewId) {
    const file = input.files[0];
    if (!file) return;

    // Validação de Tamanho (Máx 5MB)
    if (file.size > 5 * 1024 * 1024) {
      this.showToast("O arquivo não pode exceder 5MB.", "error");
      input.value = "";
      return;
    }

    if (previewId === 'id-preview') {
      this.idPhotoFile = file;
      document.getElementById('id-preview-container').classList.remove('hidden');
      document.getElementById('id-preview-container').classList.add('flex');
      document.getElementById('id-upload-placeholder').classList.add('hidden');
    } else if (previewId === 'receipt-preview') {
      this.receiptFile = file;
      document.getElementById('receipt-preview-container').classList.remove('hidden');
      document.getElementById('receipt-preview-container').classList.add('flex');
      document.getElementById('receipt-upload-placeholder').classList.add('hidden');
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      document.getElementById(previewId).src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  // Copia a Chave Pix Simulado
  copyPixKey() {
    const keyText = document.getElementById('pix-copy-key').innerText;
    navigator.clipboard.writeText(keyText).then(() => {
      this.showToast("Chave PIX copiada para a área de transferência!", "success");
    }).catch(err => {
      this.showToast("Erro ao copiar chave.", "error");
    });
  }

  // Validação e envio do Formulário de Registro
  async handleFormSubmit(event) {
    event.preventDefault();

    const form = event.target;
    let isValid = true;

    // Reset de Erros
    const errorPs = document.querySelectorAll('[id^="error-"]');
    errorPs.forEach(p => p.classList.add('hidden'));
    const inputs = form.querySelectorAll('input');
    inputs.forEach(i => i.classList.remove('border-red-500'));

    // 1. Nome Completo
    const fullName = form.fullName.value.trim();
    if (fullName.length < 3) {
      this.showError('fullName');
      isValid = false;
    }

    // 2. Email
    const email = form.email.value.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      this.showError('email');
      isValid = false;
    }

    // 3. Idade
    const age = parseInt(form.age.value);
    if (isNaN(age) || age < 18) {
      this.showError('age');
      isValid = false;
    }

    // 4. Localização
    const location = form.location.value.trim();
    if (location.length < 3) {
      this.showError('location');
      isValid = false;
    }

    // 5. Telefone (com máscara de tamanho esperado, min 14 caracteres: ex (11) 99999-9999)
    const phone = form.phone.value.trim();
    if (phone.length < 14) {
      this.showError('phone');
      isValid = false;
    }

    // 6. Foto do ID
    if (!this.idPhotoFile) {
      this.showError('idPhoto');
      isValid = false;
    }

    // 7. Foto do Comprovante Pix
    if (!this.receiptFile) {
      this.showError('receiptPhoto');
      isValid = false;
    }

    if (!isValid) {
      this.showToast("Por favor, preencha todos os campos obrigatórios corretamente.", "warning");
      // Faz scroll para o primeiro erro visível
      const firstError = document.querySelector('.border-red-500');
      if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    // Submissão de Dados
    // Cria Loader Overlay no botão
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalBtnContent = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `
      <i data-lucide="loader" class="w-5 h-5 animate-spin"></i>
      <span>Processando Inscrição...</span>
    `;
    lucide.createIcons();

    try {
      const payload = {
        fullName,
        email,
        age,
        location,
        phone,
        vehicleType: this.selectedVehicle,
        price: this.selectedPrice,
        idPhotoFile: this.idPhotoFile,
        receiptFile: this.receiptFile
      };

      const registration = await window.db.saveRegistration(payload);
      
      // Exibe Modal de Sucesso
      document.getElementById('success-modal-name').innerText = registration.fullName;
      document.getElementById('success-modal-vehicle').innerText = registration.vehicleType;
      document.getElementById('success-modal-price').innerText = `R$ ${registration.price.toFixed(2).replace('.', ',')}`;
      
      document.getElementById('modal-success-registration').classList.remove('hidden');
      document.getElementById('modal-success-registration').classList.add('flex');
    } catch (err) {
      console.error(err);
      this.showToast("Ocorreu um erro ao salvar sua inscrição. Tente novamente.", "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnContent;
      lucide.createIcons();
    }
  }

  // Auxiliares de exibição de erro no formulário
  showError(fieldId) {
    const errorEl = document.getElementById(`error-${fieldId}`);
    if (errorEl) errorEl.classList.remove('hidden');

    const inputEl = document.getElementById(fieldId);
    if (inputEl) inputEl.classList.add('border-red-500');
  }

  closeSuccessModal() {
    document.getElementById('modal-success-registration').classList.add('hidden');
    document.getElementById('modal-success-registration').classList.remove('flex');
    this.showView('landing');
  }

  // ==================== ADMIN SYSTEM LOGIC ====================

  // Abre janela pop-up de Login do Administrador
  async openAdminAccess() {
    if (await window.auth.isAdminLoggedIn()) {
      this.showView('admin');
      return;
    }
    const loginModal = document.getElementById('modal-admin-login');
    loginModal.classList.remove('hidden');
    loginModal.classList.add('flex');
    document.getElementById('admin-email').focus();
  }

  closeAdminAccess() {
    document.getElementById('modal-admin-login').classList.add('hidden');
    document.getElementById('modal-admin-login').classList.remove('flex');
  }

  // Trata a autenticação
  async handleAdminLogin(event) {
    event.preventDefault();
    const email = document.getElementById('admin-email').value;
    const password = document.getElementById('admin-password').value;
    const errorEl = document.getElementById('admin-login-error');
    const submitBtn = document.getElementById('admin-login-submit');

    errorEl.classList.add('hidden');
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Autenticando...`;
    lucide.createIcons();

    const response = await window.auth.login(email, password);

    if (response.success) {
      this.closeAdminAccess();
      document.getElementById('admin-access-btn').classList.add('hidden');
      document.getElementById('admin-logout-btn').classList.remove('hidden');
      document.getElementById('admin-logout-btn').classList.add('flex');
      
      this.showToast("Administrador autenticado com sucesso!", "success");
      this.showView('admin');
    } else {
      errorEl.innerText = response.message;
      errorEl.classList.remove('hidden');
    }

    submitBtn.disabled = false;
    submitBtn.innerHTML = `<span>Entrar no Painel</span> <i data-lucide="log-in" class="w-4 h-4"></i>`;
    lucide.createIcons();
  }

  // Desconecta o Admin
  async logoutAdmin() {
    await window.auth.logout();
    document.getElementById('admin-logout-btn').classList.add('hidden');
    document.getElementById('admin-logout-btn').classList.remove('flex');
    document.getElementById('admin-access-btn').classList.remove('hidden');
    this.showToast("Sessão de administrador encerrada.", "info");
    this.showView('landing');
  }

  // Atualiza os dados do Dashboard (Buscando do DB)
  async refreshDashboard() {
    const refreshIcon = document.getElementById('refresh-icon');
    if (refreshIcon) refreshIcon.classList.add('animate-spin');

    try {
      this.allRegistrations = await window.db.getAllRegistrations();
      this.updateMetrics();
      this.renderTable();
    } catch (err) {
      console.error(err);
      this.showToast("Falha ao sincronizar dados com o banco.", "error");
    } finally {
      if (refreshIcon) {
        setTimeout(() => {
          refreshIcon.classList.remove('animate-spin');
        }, 500);
      }
    }
  }

  // Calcula e atualiza os painéis de métricas do admin
  updateMetrics() {
    const total = this.allRegistrations.length;
    const pending = this.allRegistrations.filter(r => r.status === 'Pendente').length;
    const validated = this.allRegistrations.filter(r => r.status === 'Validado').length;

    // Calcula faturamento apenas para os Validados (pagamento confirmado)
    const moneyCollected = this.allRegistrations
      .filter(r => r.status === 'Validado')
      .reduce((sum, r) => sum + r.price, 0);

    document.getElementById('stat-total').innerText = total;
    document.getElementById('stat-pending').innerText = pending;
    document.getElementById('stat-validated').innerText = validated;
    document.getElementById('stat-money').innerText = `R$ ${moneyCollected.toFixed(2).replace('.', ',')}`;
  }

  // Alterna o filtro das categorias na tabela
  setDashboardFilter(filter) {
    this.currentFilter = filter;
    
    // Atualiza classes ativas de estilização dos botões
    const buttons = document.querySelectorAll('.tab-filter');
    buttons.forEach(btn => {
      if (btn.id === `tab-filter-${filter.replace('/', '-')}`) {
        btn.className = 'tab-filter px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer bg-orange-500 text-slate-950 shadow-md shadow-orange-500/15 border border-orange-500/20';
      } else {
        btn.className = 'tab-filter px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer text-slate-400 hover:text-white bg-slate-900/60 hover:bg-slate-800/50 border border-white/5';
      }
    });

    this.renderTable();
  }

  // Desenha a tabela com filtros aplicados
  renderTable() {
    const tbody = document.getElementById('registrations-tbody');
    const noDataAlert = document.getElementById('no-data-alert');
    tbody.innerHTML = '';

    // Aplica o filtro
    const filtered = this.currentFilter === 'All' 
      ? this.allRegistrations 
      : this.allRegistrations.filter(r => r.vehicleType === this.currentFilter);

    if (filtered.length === 0) {
      noDataAlert.classList.remove('hidden');
      tbody.closest('table').classList.add('hidden');
      return;
    }

    noDataAlert.classList.add('hidden');
    tbody.closest('table').classList.remove('hidden');

    filtered.forEach(r => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-800/40 transition-colors border-b border-white/5 align-middle';

      // Status Badge Styling
      const statusBadge = r.status === 'Validado'
        ? '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-500/10 border border-orange-500/20 text-orange-400">Validado</span>'
        : '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 border border-amber-500/20 text-amber-400">Pendente</span>';

      const regDate = new Date(r.date).toLocaleDateString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });

      tr.innerHTML = `
        <td class="px-6 py-4 font-bold text-white">${r.fullName}</td>
        <td class="px-6 py-4">
          <p class="text-xs text-slate-400">${r.email}</p>
          <p class="text-xs font-mono text-slate-500 mt-0.5">${r.phone}</p>
        </td>
        <td class="px-6 py-4">
          <span class="text-xs font-semibold bg-slate-800 text-slate-300 px-2 py-1 rounded-md border border-slate-700">${r.vehicleType}</span>
        </td>
        <td class="px-6 py-4">${statusBadge}</td>
        <td class="px-6 py-4 text-xs font-mono text-slate-500">${regDate}</td>
        <td class="px-6 py-4 text-right">
          <div class="flex items-center justify-end gap-2">
          <button onclick="app.openDetailModal('${r.id}')" class="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold border border-white/10 hover:border-orange-500/30 transition-all cursor-pointer inline-flex items-center gap-1">
            <i data-lucide="eye" class="w-3.5 h-3.5 text-orange-400"></i>
            <span>Visualizar</span>
          </button>
          <button onclick="app.deleteRegistrationById('${r.id}')" class="px-3.5 py-1.5 bg-red-950/30 hover:bg-red-900/50 text-red-400 hover:text-white rounded-lg text-xs font-semibold border border-red-500/20 hover:border-red-500/50 transition-all cursor-pointer inline-flex items-center gap-1">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });

    lucide.createIcons();
  }

  // Abre Modal Detalhado do Participante
  openDetailModal(id) {
    const participant = this.allRegistrations.find(r => r.id === id);
    if (!participant) return;

    this.currentParticipant = participant;

    document.getElementById('detail-name').innerText = participant.fullName;
    document.getElementById('detail-email-link').innerText = participant.email;
    document.getElementById('detail-email-link').href = `mailto:${participant.email}`;
    document.getElementById('detail-phone').innerText = participant.phone;
    document.getElementById('detail-location').innerText = participant.location;
    document.getElementById('detail-vehicle-price').innerText = `${participant.vehicleType} (R$ ${participant.price.toFixed(2).replace('.', ',')})`;
    document.getElementById('detail-age').innerText = `${participant.age} anos`;

    const formattedDate = new Date(participant.date).toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    document.getElementById('detail-date-display').innerText = `Registrado em: ${formattedDate}`;

    // Configuração dos previews das imagens
    document.getElementById('detail-id-img').src = participant.idPhoto;
    document.getElementById('detail-receipt-img').src = participant.paymentReceipt;

    // Status Badge e Botão de Validação
    const badge = document.getElementById('detail-status-badge');
    const validateBtn = document.getElementById('admin-validate-btn');

    if (participant.status === 'Validado') {
      badge.className = 'px-2 py-0.5 rounded font-bold text-[10px] uppercase bg-orange-500/10 border border-orange-500/20 text-orange-400';
      badge.innerText = 'Validado';
      validateBtn.classList.add('hidden');
    } else {
      badge.className = 'px-2 py-0.5 rounded font-bold text-[10px] uppercase bg-amber-500/10 border border-amber-500/20 text-amber-400';
      badge.innerText = 'Pendente';
      validateBtn.classList.remove('hidden');
    }

    const modal = document.getElementById('modal-participant-detail');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    
    lucide.createIcons();
  }

  closeDetailModal() {
    document.getElementById('modal-participant-detail').classList.add('hidden');
    document.getElementById('modal-participant-detail').classList.remove('flex');
  }

  // Validação Oficial da Inscrição pelo Administrador
  async validateCurrentParticipant() {
    if (!this.currentParticipant) return;
    
    const validateBtn = document.getElementById('admin-validate-btn');
    const originalBtn = validateBtn.innerHTML;
    validateBtn.disabled = true;
    validateBtn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Processando...`;
    lucide.createIcons();

    try {
      await window.db.updateRegistrationStatus(this.currentParticipant.id, 'Validado');
      this.showToast(`Inscrição de ${this.currentParticipant.fullName} validada!`, "success");
      
      // Atualiza o estado local do participante aberto no momento
      this.currentParticipant.status = 'Validado';
      
      // Recarrega dados e atualiza a interface de detalhe
      await this.refreshDashboard();
      this.openDetailModal(this.currentParticipant.id);
    } catch (err) {
      console.error(err);
      this.showToast("Falha ao salvar a validação.", "error");
    } finally {
      validateBtn.disabled = false;
      validateBtn.innerHTML = originalBtn;
      lucide.createIcons();
    }
  }

  // Exclui inscrição pelo modal de detalhes
  async deleteCurrentParticipant() {
    if (!this.currentParticipant) return;

    const confirmed = confirm(`Tem certeza que deseja excluir a inscrição de ${this.currentParticipant.fullName}? Esta ação não pode ser desfeita.`);
    if (!confirmed) return;

    try {
      await window.db.deleteRegistration(this.currentParticipant.id);
      this.showToast(`Inscrição de ${this.currentParticipant.fullName} excluída!`, "success");
      this.closeDetailModal();
      await this.refreshDashboard();
    } catch (err) {
      console.error(err);
      this.showToast("Erro ao excluir inscrição.", "error");
    }
  }

  // Exclui inscrição diretamente pela tabela
  async deleteRegistrationById(id) {
    const participant = this.allRegistrations.find(r => r.id === id);
    if (!participant) return;

    const confirmed = confirm(`Tem certeza que deseja excluir a inscrição de ${participant.fullName}? Esta ação não pode ser desfeita.`);
    if (!confirmed) return;

    try {
      await window.db.deleteRegistration(id);
      this.showToast(`Inscrição de ${participant.fullName} excluída!`, "success");
      await this.refreshDashboard();
    } catch (err) {
      console.error(err);
      this.showToast("Erro ao excluir inscrição.", "error");
    }
  }

  // Zoom de Imagem do Documento/Recibo
  zoomImage(imgSrc) {
    const zoomModal = document.getElementById('modal-image-zoom');
    const zoomImg = document.getElementById('zoom-img-target');
    zoomImg.src = imgSrc;
    zoomModal.classList.remove('hidden');
    zoomModal.classList.add('flex');
    lucide.createIcons();
  }

  closeImageZoom() {
    document.getElementById('modal-image-zoom').classList.add('hidden');
    document.getElementById('modal-image-zoom').classList.remove('flex');
  }

  // ==================== GLOBAL NOTIFICATIONS TOAST ====================
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'glass-panel pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border border-white/10 animate-fade-in-up';
    
    // Cores e Ícones dependendo do tipo
    let borderLeftColor = 'border-l-4 border-l-blue-500';
    let iconHTML = `<i data-lucide="info" class="w-5 h-5 text-blue-400"></i>`;

    if (type === 'success') {
      borderLeftColor = 'border-l-4 border-l-orange-500';
      iconHTML = `<i data-lucide="check-circle" class="w-5 h-5 text-orange-400"></i>`;
    } else if (type === 'error') {
      borderLeftColor = 'border-l-4 border-l-red-500';
      iconHTML = `<i data-lucide="x-circle" class="w-5 h-5 text-red-400"></i>`;
    } else if (type === 'warning') {
      borderLeftColor = 'border-l-4 border-l-amber-500';
      iconHTML = `<i data-lucide="alert-triangle" class="w-5 h-5 text-amber-400"></i>`;
    }

    toast.classList.add(...borderLeftColor.split(' '));
    toast.innerHTML = `
      ${iconHTML}
      <p class="text-sm font-semibold text-white pr-4">${message}</p>
      <button class="text-slate-400 hover:text-white ml-auto cursor-pointer" onclick="this.parentElement.remove()">
        <i data-lucide="x" class="w-3.5 h-3.5"></i>
      </button>
    `;

    container.appendChild(toast);
    lucide.createIcons();

    // Auto-destruição em 4 segundos
    setTimeout(() => {
      toast.classList.add('opacity-0', 'transition-opacity', 'duration-500');
      setTimeout(() => toast.remove(), 500);
    }, 4000);
  }
}

// Inicializa a aplicação
window.app = new TrailApp();
window.addEventListener('DOMContentLoaded', () => window.app.init());
