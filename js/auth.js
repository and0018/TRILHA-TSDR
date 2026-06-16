// js/auth.js
// Controle de Autenticação do Administrador

class TrailAuth {
  constructor() {
    this.sessionKey = 'trail_admin_authenticated';
    // Credenciais padrão do painel (podem ser alteradas ou integradas com Firebase no futuro)
    this.defaultUsername = 'Nanda';
    this.defaultPassword = 'amajariTrilha26';
  }

  // Verifica se o administrador está logado na sessão atual
  isAdminLoggedIn() {
    return sessionStorage.getItem(this.sessionKey) === 'true';
  }

  // Realiza a tentativa de login simulado
  async login(username, password) {
    // Simula uma pequena latência de rede para feedback visual premium
    await new Promise(resolve => setTimeout(resolve, 600));

    const checkUser = username.trim().toLowerCase() === this.defaultUsername.toLowerCase();
    const checkPass = password === this.defaultPassword;

    if (checkUser && checkPass) {
      sessionStorage.setItem(this.sessionKey, 'true');
      console.log("Administrador autenticado com sucesso.");
      return { success: true };
    } else {
      console.warn("Credenciais de administrador incorretas.");
      return { 
        success: false, 
        message: "Usuário ou senha incorretos." 
      };
    }
  }

  // Desloga o administrador
  logout() {
    sessionStorage.removeItem(this.sessionKey);
    console.log("Administrador desconectado.");
  }
}

// Expõe uma instância global
window.auth = new TrailAuth();
