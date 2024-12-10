document.addEventListener('DOMContentLoaded', () => {
    const simulationForm = document.getElementById('simulationForm')
    const valorInvestidoInput = document.getElementById('valorInvestido')
    const dataInvestimentoInput = document.getElementById('dataInvestimento')
    const periodoDiasInput = document.getElementById('periodoDias')
    const projectionList = document.getElementById('projectionList')
    const resultSection = document.getElementById('result')
    const rendimentoChartCtx = document.getElementById('rendimentoChart').getContext('2d')
    const loadingIndicator = document.getElementById('loading')
    const taxaAnualDisplay = document.getElementById('taxaAnualDisplay')
    const feriadosTableBody = document.getElementById('feriadosTableBody')
    let rendimentoChartInstance = null

    const formatarValor = (valor) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
    }

    const isDiaUtil = (date) => {
        const dia = date.getDay()
        return dia !== 0 && dia !== 6
    }

    const obterFeriadosNacionais = async (ano) => {
        const response = await fetch(`https://brasilapi.com.br/api/feriados/v1/${ano}`)
        if (!response.ok) throw new Error('Erro ao obter feriados')
        return await response.json()
    }

    const obterTaxaDiaria = async (ano) => {
        const dataInicial = `01/01/${ano}`
        const dataFinal = `31/12/${ano}`
        const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.11/dados?formato=json&dataInicial=${dataInicial}&dataFinal=${dataFinal}`
        const response = await fetch(url)
        if (!response.ok) throw new Error('Erro na requisição da API')
        const data = await response.json()
        if (data.length === 0) throw new Error('Nenhuma taxa CDI encontrada.')
        data.sort((a, b) => {
            const [diaA, mesA, anoA] = a.data.split('/').map(num => parseInt(num, 10))
            const [diaB, mesB, anoB] = b.data.split('/').map(num => parseInt(num, 10))
            return new Date(anoA, mesA - 1, diaA) - new Date(anoB, mesB - 1, diaB)
        })
        const ultimaTaxa = parseFloat(data[data.length - 1].valor)
        const taxaDecimal = ultimaTaxa / 100
        return taxaDecimal
    }

    const obterAliquotaIR = (dias) => {
        if (dias <= 180) return 0.225
        else if (dias <= 360) return 0.20
        else if (dias <= 720) return 0.175
        else return 0.15
    }

    simulationForm.addEventListener('submit', async (event) => {
        event.preventDefault()
        let valorInvestido = parseFloat(valorInvestidoInput.value.replace(/[^0-9,-]+/g, '').replace(',', '.'))
        const dataInvestimento = new Date(dataInvestimentoInput.value)
        const periodoDias = parseInt(periodoDiasInput.value, 10)
        if (isNaN(valorInvestido) || isNaN(periodoDias) || isNaN(dataInvestimento.getTime())) {
            alert('Por favor, preencha todos os campos corretamente.')
            return
        }

        projectionList.innerHTML = ''
        feriadosTableBody.innerHTML = ''
        resultSection.style.display = 'none'
        loadingIndicator.style.display = 'block'
        const anoAtual = dataInvestimento.getFullYear()
        const feriadosNacionais = await obterFeriadosNacionais(anoAtual)
        feriadosNacionais.forEach(feriado => {
            const tr = document.createElement('tr')
            const dataFeriado = new Date(feriado.date)
            tr.innerHTML = `<td>${dataFeriado.toLocaleDateString('pt-BR')}</td><td>${feriado.name}</td>`
            feriadosTableBody.appendChild(tr)
        })
        const feriadosSet = new Set(feriadosNacionais.map(f => f.date))
        const taxaDiariaDecimal = await obterTaxaDiaria(anoAtual)
        loadingIndicator.style.display = 'none'
        if (taxaDiariaDecimal === null) {
            alert('Não foi possível obter a Taxa Diária (CDI).')
            return
        }

        const cdiAnual = Math.pow(1 + taxaDiariaDecimal, 252) - 1
        taxaAnualDisplay.textContent = (cdiAnual * 100).toFixed(2)
        const taxaDiaria = taxaDiariaDecimal
        const aliquotaIR = obterAliquotaIR(periodoDias)

        let diasContados = 0
        let dataAtual = new Date(dataInvestimento)
        const labels = []
        const dadosBrutos = []
        const dadosLiquidos = []

        while (diasContados < periodoDias) {
            dataAtual.setDate(dataAtual.getDate() + 1)
            const ano = dataAtual.getFullYear()
            const mes = String(dataAtual.getMonth() + 1).padStart(2, '0')
            const dia = String(dataAtual.getDate()).padStart(2, '0')
            const dataFormatada = `${ano}-${mes}-${dia}`
            if (isDiaUtil(dataAtual) && !feriadosSet.has(dataFormatada)) {
                diasContados++
                const rendimentoDiaBruto = valorInvestido * taxaDiaria
                const rendimentoDiaLiquido = rendimentoDiaBruto * (1 - aliquotaIR)
                valorInvestido += rendimentoDiaLiquido
                const listItem = document.createElement('li')
                listItem.classList.add('list-group-item')
                listItem.innerHTML = `
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <strong>Dia ${dataAtual.toLocaleDateString('pt-BR')}</strong><br>
                            Rendimento Bruto: ${formatarValor(rendimentoDiaBruto)}<br>
                            Rendimento Líquido: ${formatarValor(rendimentoDiaLiquido)}
                        </div>
                        <span class="badge bg-success">${formatarValor(valorInvestido)}</span>
                    </div>
                `
                projectionList.appendChild(listItem)
                labels.push(dataAtual.toLocaleDateString('pt-BR'))
                dadosBrutos.push((valorInvestido - rendimentoDiaLiquido).toFixed(2))
                dadosLiquidos.push(valorInvestido.toFixed(2))
            }
        }

        resultSection.style.display = 'block'
        if (rendimentoChartInstance) rendimentoChartInstance.destroy()
        rendimentoChartInstance = new Chart(rendimentoChartCtx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Saldo Bruto (R$)',
                        data: dadosBrutos,
                        backgroundColor: 'rgba(220, 53, 69, 0.2)',
                        borderColor: 'rgba(220, 53, 69, 1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.3,
                        pointBackgroundColor: 'rgba(220, 53, 69, 1)'
                    },
                    {
                        label: 'Saldo Líquido (R$)',
                        data: dadosLiquidos,
                        backgroundColor: 'rgba(40, 167, 69, 0.2)',
                        borderColor: 'rgba(40, 167, 69, 1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.3,
                        pointBackgroundColor: 'rgba(40, 167, 69, 1)'
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false
                    }
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                },
                scales: {
                    x: {
                        display: true,
                        title: {
                            display: true,
                            text: 'Data'
                        },
                        ticks: {
                            maxTicksLimit: 10
                        }
                    },
                    y: {
                        display: true,
                        title: {
                            display: true,
                            text: 'Saldo (R$)'
                        },
                        beginAtZero: false
                    }
                }
            }
        })
        valorInvestidoInput.value = 'R$ ' + valorInvestido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
    })

    valorInvestidoInput.addEventListener('input', (event) => {
        let valor = event.target.value.replace(/\D/g, '')
        valor = (valor / 100).toFixed(2).replace('.', ',')
        valor = valor.replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1.')
        event.target.value = `R$ ${valor}`
    })

    periodoDiasInput.addEventListener('input', (event) => {
        let valor = event.target.value.replace(/\D/g, '')
        event.target.value = valor
    })
})
