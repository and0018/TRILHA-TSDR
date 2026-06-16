// js/db.js
// Camada de banco de dados unificada: IndexedDB (local) & Firebase (Firestore / Storage)

const DB_NAME = 'TrailEventDB';
const DB_VERSION = 1;
const STORE_NAME = 'registrations';

class TrailDatabase {
  constructor() {
    this.firebaseActive = false;
    this.db = null; // Instância IndexedDB
  }

  // Inicializa o banco de dados
  async init() {
    // 1. Tenta inicializar o Firebase se houver chaves configuradas
    const config = window.FIREBASE_CONFIG;
    const hasFirebaseKeys = config && config.apiKey && config.apiKey.trim() !== "" && config.projectId && config.projectId.trim() !== "";

    if (hasFirebaseKeys) {
      try {
        console.log("Detectadas chaves do Firebase. Inicializando conexão com a nuvem...");
        
        // Verifica se os SDKs do Firebase estão disponíveis globalmente
        if (typeof firebase !== 'undefined') {
          firebase.initializeApp(config);
          this.firestore = firebase.firestore();
          this.storage = firebase.storage();
          this.firebaseActive = true;
          console.log("Firebase conectado e ativo com sucesso!");
          return true;
        } else {
          console.warn("SDKs do Firebase não foram carregados no HTML. Usando IndexedDB local.");
        }
      } catch (err) {
        console.error("Erro ao conectar ao Firebase, usando IndexedDB como fallback:", err);
      }
    }

    // 2. Fallback para IndexedDB local
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

  // Verifica se o Firebase está ativo
  isFirebaseActive() {
    return this.firebaseActive;
  }

  // Configura a conexão do IndexedDB
  initIndexedDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = (event) => reject(event.target.error);
      request.onsuccess = (event) => resolve(event.target.result);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          // Cria o Object Store usando 'id' como chave
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          // Cria índices úteis
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('vehicleType', 'vehicleType', { unique: false });
          store.createIndex('date', 'date', { unique: false });
        }
      };
    });
  }

  // Salva uma nova inscrição
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

    if (this.firebaseActive) {
      try {
        console.log("Salvando dados no Firebase Firestore...");
        
        // 1. Faz upload das fotos para o Firebase Storage
        const idPhotoUrl = await this.uploadFileToFirebase(data.idPhotoFile, `ids/${registrationId}`);
        const receiptUrl = await this.uploadFileToFirebase(data.receiptFile, `receipts/${registrationId}`);
        
        registrationData.idPhoto = idPhotoUrl;
        registrationData.paymentReceipt = receiptUrl;

        // 2. Salva o documento no Firestore
        await this.firestore.collection(STORE_NAME).doc(registrationId).set(registrationData);
        console.log("Inscrição salva com sucesso no Firestore:", registrationId);
        return registrationData;
      } catch (err) {
        console.error("Erro ao salvar no Firebase. Tentando fallback para IndexedDB local...", err);
        // Fallback rápido se falhar a rede no meio do processo
      }
    }

    // Processamento local com IndexedDB
    // Converte os arquivos para strings Base64
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

  // Lista todas as inscrições
  async getAllRegistrations() {
    if (this.firebaseActive) {
      try {
        console.log("Buscando inscrições do Firebase Firestore...");
        const snapshot = await this.firestore.collection(STORE_NAME).orderBy('date', 'desc').get();
        const list = [];
        snapshot.forEach(doc => {
          list.push(doc.data());
        });
        return list;
      } catch (err) {
        console.error("Erro ao buscar no Firebase, usando IndexedDB local como fallback:", err);
      }
    }

    // Listagem local
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        // Ordena por data decrescente (mais recente primeiro)
        const sorted = request.result.sort((a, b) => new Date(b.date) - new Date(a.date));
        resolve(sorted);
      };
      request.onerror = (event) => reject(event.target.error);
    });
  }

  // Atualiza o status de uma inscrição (Pendente -> Validado)
  async updateRegistrationStatus(id, newStatus) {
    if (this.firebaseActive) {
      try {
        console.log(`Atualizando status no Firebase Firestore para a inscrição: ${id}...`);
        await this.firestore.collection(STORE_NAME).doc(id).update({
          status: newStatus
        });
        return true;
      } catch (err) {
        console.error("Erro ao atualizar status no Firebase:", err);
      }
    }

    // Atualização local
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

  // Auxiliar: Envia arquivo para o Firebase Storage e retorna a URL de download
  uploadFileToFirebase(file, path) {
    return new Promise((resolve, reject) => {
      const storageRef = this.storage.ref(path);
      const uploadTask = storageRef.put(file);

      uploadTask.on('state_changed', 
        null, 
        (error) => reject(error), 
        async () => {
          const downloadUrl = await uploadTask.snapshot.ref.getDownloadURL();
          resolve(downloadUrl);
        }
      );
    });
  }

  // Auxiliar: Converte objeto File para string Base64 para persistência local
  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = (error) => reject(error);
    });
  }
}

// Expõe uma única instância global do banco de dados
window.db = new TrailDatabase();
