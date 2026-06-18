// js/db.js
// Camada de banco de dados unificada: IndexedDB (local) & Supabase (PostgreSQL + Storage)

const DB_NAME = 'TrailEventDB';
const DB_VERSION = 1;
const STORE_NAME = 'registrations';

class TrailDatabase {
  constructor() {
    this.supabaseActive = false;
    this.db = null;
    this.supabase = null;
  }

  async init() {
    const config = window.SUPABASE_CONFIG;
    const hasKeys = config && config.url && config.url.trim() !== "" && config.anonKey && config.anonKey.trim() !== "";

    if (hasKeys) {
      try {
        console.log("Detectadas chaves do Supabase. Inicializando conexão...");
        if (typeof supabase !== 'undefined') {
          this.supabase = supabase.createClient(config.url, config.anonKey);
          this.supabaseActive = true;
          console.log("Supabase conectado com sucesso!");
        } else {
          console.warn("SDK do Supabase não carregado no HTML. Usando IndexedDB local.");
        }
      } catch (err) {
        console.error("Erro ao conectar ao Supabase, usando IndexedDB como fallback:", err);
      }
    }

    console.log("Inicializando banco de dados local (IndexedDB)...");
    try {
      this.db = await this.initIndexedDB();
      console.log("IndexedDB local inicializado com sucesso!");
      return true;
    } catch (err) {
      console.error("Falha fatal ao inicializar o IndexedDB:", err);
      throw err;
    }
  }

  isSupabaseActive() {
    return this.supabaseActive;
  }

  initIndexedDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = (event) => reject(event.target.error);
      request.onsuccess = (event) => resolve(event.target.result);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('vehicleType', 'vehicleType', { unique: false });
          store.createIndex('date', 'date', { unique: false });
        }
      };
    });
  }

  _withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout: ${label} excedeu ${ms}ms`)), ms))
    ]);
  }

  async saveRegistration(data) {
    const registrationId = 'reg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const registrationData = {
      id: registrationId,
      fullName: data.fullName,
      email: data.email,
      age: parseInt(data.age),
      location: data.location,
      phone: data.phone,
      vehicleType: data.vehicleType,
      price: data.price,
      status: 'Pendente',
      date: new Date().toISOString()
    };

    if (this.supabaseActive) {
      try {
        console.log("Salvando dados no Supabase...");

        const idPhotoUrl = await this._withTimeout(
          this.uploadFileToSupabase(data.idPhotoFile, `ids/${registrationId}`),
          30000,
          'Upload foto ID'
        );
        const receiptUrl = await this._withTimeout(
          this.uploadFileToSupabase(data.receiptFile, `receipts/${registrationId}`),
          30000,
          'Upload comprovante'
        );

        registrationData.idPhoto = idPhotoUrl;
        registrationData.paymentReceipt = receiptUrl;

        const { error } = await this._withTimeout(
          this.supabase.from('registrations').insert({
            id: registrationId,
            full_name: data.fullName,
            email: data.email,
            age: parseInt(data.age),
            location: data.location,
            phone: data.phone,
            vehicle_type: data.vehicleType,
            price: data.price,
            status: 'Pendente',
            date: registrationData.date,
            id_photo: idPhotoUrl,
            payment_receipt: receiptUrl
          }),
          15000,
          'Salvar no Supabase'
        );

        if (error) throw error;

        console.log("Inscrição salva com sucesso no Supabase:", registrationId);
        return registrationData;
      } catch (err) {
        console.error("Erro ao salvar no Supabase. Tentando fallback para IndexedDB local...", err);
      }
    }

    console.log("Salvando dados no IndexedDB local...");
    const idPhotoBase64 = await this.fileToBase64(data.idPhotoFile);
    const receiptBase64 = await this.fileToBase64(data.receiptFile);

    registrationData.idPhoto = idPhotoBase64;
    registrationData.paymentReceipt = receiptBase64;

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.add(registrationData);

      request.onsuccess = () => {
        console.log("Inscrição salva no IndexedDB com sucesso!", registrationId);
        resolve(registrationData);
      };
      request.onerror = (event) => reject(event.target.error);
    });
  }

  async getAllRegistrations() {
    if (this.supabaseActive) {
      try {
        console.log("Buscando inscrições do Supabase...");
        const { data, error } = await this.supabase
          .from('registrations')
          .select('*')
          .order('date', { ascending: false });

        if (error) throw error;

        return data.map(r => ({
          id: r.id,
          fullName: r.full_name,
          email: r.email,
          age: r.age,
          location: r.location,
          phone: r.phone,
          vehicleType: r.vehicle_type,
          price: r.price,
          status: r.status,
          date: r.date,
          idPhoto: r.id_photo,
          paymentReceipt: r.payment_receipt
        }));
      } catch (err) {
        console.error("Erro ao buscar no Supabase, usando IndexedDB local como fallback:", err);
      }
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const sorted = request.result.sort((a, b) => new Date(b.date) - new Date(a.date));
        resolve(sorted);
      };
      request.onerror = (event) => reject(event.target.error);
    });
  }

  async updateRegistrationStatus(id, newStatus) {
    if (this.supabaseActive) {
      try {
        console.log(`Atualizando status no Supabase para inscrição: ${id}...`);
        const { error } = await this.supabase
          .from('registrations')
          .update({ status: newStatus })
          .eq('id', id);

        if (error) throw error;
        return true;
      } catch (err) {
        console.error("Erro ao atualizar status no Supabase:", err);
      }
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const data = getRequest.result;
        if (!data) {
          reject(new Error("Inscrição não encontrada."));
          return;
        }

        data.status = newStatus;
        const updateRequest = store.put(data);

        updateRequest.onsuccess = () => resolve(true);
        updateRequest.onerror = (event) => reject(event.target.error);
      };

      getRequest.onerror = (event) => reject(event.target.error);
    });
  }

  async deleteRegistration(id) {
    if (this.supabaseActive) {
      try {
        console.log(`Excluindo inscrição do Supabase: ${id}...`);
        const { error } = await this.supabase
          .from('registrations')
          .delete()
          .eq('id', id);

        if (error) throw error;
        return true;
      } catch (err) {
        console.error("Erro ao excluir no Supabase:", err);
      }
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve(true);
      request.onerror = (event) => reject(event.target.error);
    });
  }

  async uploadFileToSupabase(file, path) {
    const { data, error } = await this.supabase
      .storage
      .from('registrations')
      .upload(path, file, { upsert: true });

    if (error) throw error;

    const { data: { publicUrl } } = this.supabase
      .storage
      .from('registrations')
      .getPublicUrl(data.path);

    return publicUrl;
  }

  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = (error) => reject(error);
    });
  }
}

window.db = new TrailDatabase();
