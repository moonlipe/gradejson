/**
 * Utilitário para extrair objetos JSON de textos
 */

// Função principal que lê arquivos e extrai JSONs
async function extrairJsonsDeArquivos(files) {
    return new Promise((resolve) => {
        let resultados = [];
        let pendentes = files.length;

        if (pendentes === 0) return resolve([]);

        for (let file of files) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const conteudo = e.target.result;
                const objetosExtraidos = extrairJsonsDoTexto(conteudo);
                resultados.push(...objetosExtraidos);
                pendentes--;
                if (pendentes === 0) resolve(resultados);
            };
            reader.onerror = () => {
                pendentes--;
                if (pendentes === 0) resolve(resultados);
            };
            reader.readAsText(file);
        }
    });
}

// Extrai padrões que parecem JSON de um texto
function extrairJsonsDoTexto(texto) {
    const objetos = [];
    
    // 1. Tentar parse direto se o texto inteiro for um json array ou objeto
    try {
        const parsed = JSON.parse(texto);
        if (Array.isArray(parsed)) {
            parsed.forEach(item => { 
                if (item && typeof item === 'object') objetos.push(item); 
            });
        } else if (parsed && typeof parsed === 'object') {
            objetos.push(parsed);
        }
        if (objetos.length > 0) return objetos;
    } catch (e) { 
        // Não é um json puro, segue tentativa por blocos
    }

    // 2. Abordagem ingênua: capturar tudo entre { e } tentando parsear
    const linhas = texto.split('\n');
    let buffer = '';
    let chaves = 0;
    let inicio = -1;

    for (let i = 0; i < linhas.length; i++) {
        const linha = linhas[i];
        for (let j = 0; j < linha.length; j++) {
            const char = linha[j];
            buffer += char;
            if (char === '{') {
                if (chaves === 0) inicio = buffer.length - 1;
                chaves++;
            } else if (char === '}') {
                chaves--;
                if (chaves === 0 && inicio !== -1) {
                    const trecho = buffer.substring(inicio);
                    try {
                        const obj = JSON.parse(trecho);
                        if (obj && typeof obj === 'object' && !Array.isArray(obj)) objetos.push(obj);
                    } catch (err) { 
                        // Ignora trechos que não são JSON válidos
                    }
                    inicio = -1;
                }
            }
        }
        buffer += '\n';
    }
    return objetos;
}

// Disponibiliza funções globalmente
window.extrairJsonsDeArquivos = extrairJsonsDeArquivos;
window.extrairJsonsDoTexto = extrairJsonsDoTexto;