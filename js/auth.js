// js/auth.js
// Controle de Autenticação do Administrador via Supabase Auth

class TrailAuth {
  constructor() {
    this.sessionKey = 'trail_admin_authenticated';
  }

  // Verifica se o administrador está logado (checa a sessão do Supabase)
  async isAdminLoggedIn() {
    if (!window.db || !window.db.supabase) return false;
    try {
      const { data: { session } } = await window.db.supabase.auth.getSession();
      return !!session;
    } catch {
      return false;
    }
  }

  // Realiza login via Supabase Auth (email + senha)
  async login(email, password) {
    if (!window.db || !window.db.supabase) {
      return { success: false, message: "Sistema não inicializado. Recarregue a página." };
    }

    const { data, error } = await window.db.supabase.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (error) {
      return { success: false, message: "E-mail ou senha incorretos." };
    }

    sessionStorage.setItem(this.sessionKey, 'true');
    return { success: true };
  }

  // Desloga o administrador
  async logout() {
    if (window.db && window.db.supabase) {
      await window.db.supabase.auth.signOut();
    }
    sessionStorage.removeItem(this.sessionKey);
  }
}

window.auth = new TrailAuth();
