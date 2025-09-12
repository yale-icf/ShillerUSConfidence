// Global variable to track rolling average visibility
let showRollingAverage = false;
let currentPlotData = null; // Store current plot data for toggling

// Initialize collapsible sections and calculation content
document.addEventListener('DOMContentLoaded', function() {
    const collapsibles = document.querySelectorAll('.collapsible-header');
    collapsibles.forEach(header => {
        header.addEventListener('click', function() {
            const content = this.nextElementSibling;
            const isExpanded = content.style.display === 'block';
            content.style.display = isExpanded ? 'none' : 'block';
            this.style.borderBottom = isExpanded ? '1px solid #ddd' : 'none';
            this.querySelector('::after').textContent = isExpanded ? '+' : '-';
        });
    });

    // Load initial plot and calculation
    switchIndex('one-year');
});

// Handle index switching
function switchIndex(indexId) {
    const titles = {
        'one-year': 'U.S. One-Year Confidence Index',
        'crash': 'U.S. Crash Confidence Index',
        'buy-dips': 'U.S. Buy-on-Dips Confidence Index',
        'valuation': 'U.S. Valuation Confidence Index'
    };
    document.getElementById('plot-title').textContent = titles[indexId];
    loadPlotData(indexId);
    updateCalculationContent(indexId);
}

// Toggle rolling average visibility
function toggleRollingAverage() {
    showRollingAverage = !showRollingAverage;
    const button = document.getElementById('rolling-avg-toggle');
    button.textContent = showRollingAverage ? 'Show Raw Monthly' : 'Show 6 Month Rolling Avg';
    
    // Re-render the plot with current data
    if (currentPlotData) {
        renderPlot(currentPlotData);
    }
}

// Update calculation content based on selected index
function updateCalculationContent(indexId) {
  const questions = {
      'one-year': 'How much of a change in percentage terms do you expect in the following (use + before your number to indicate an expected increase, or - to indicate an expected decrease, leave blanks where you do not know).' +
      '<ul>' +
        '<li>In 1 month </li>' +
        '<li>In 3 months </li>' +
        '<li>In 6 months </li>' +
        '<li>In 1 year </li>' +
        '<li>In 10 years </li>' +
      '</ul>',
      'crash': 'What do you think is the probability of a catastrophic stock market crash in the U. S., like that of October 28, 1929 or October 19, 1987, in the next six months, including the case that a crash occurred in the other countries and spreads to the U. S.? (An answer of 0% means that it cannot happen, an answer of 100% means it is sure to happen.)',
      'buy-dips': 'If the Dow dropped 3% tomorrow, I would guess that the day after tomorrow the Dow would: [Circle 1, 2, 3, or 4]' +
      '<ol>' +
        '<li>Increase   Give percent: ---%</li>' +
        '<li>Decrease   Give percent: ---%</li>' +
        '<li>Stay the same</li>' +
        '<li>No opinion</li>' +
      '</ol>',
      'valuation': 'Stock prices in the United States, when compared with measures of true fundamental value or sensible investment value, area: [Circle 1, 2, 3, or 4]' +
      '<ol>' +
        '<li>Too Low</li>' +
        '<li>Too high</li>' +
        '<li>About right</li>' +
        '<li>Do not know</li>' +
      '</ol>',
  };
  
  const calculations = {
      'one-year': 'The percent of the population expecting an increase in the Dow in the coming year. The One-Year Confidence Index is the percentage of respondents giving a number strictly greater than zero for "in 1 year." Note that the question is worded to mention the possibility that the respondent could predict a downturn, and so this question will obtain more such responses than more optimistically worded questions used by some other surveys. However, the issue is how the answers change through time, and the wording of the question has not been changed through time (except to add the 1-month and the ten-year categories, which were not on the earliest questionnaires).',
      'crash': 'The percent of the population who attach little probability to a stock market crash in the next six months. The Crash Confidence Index is the percentage of respondents who think that the probability is strictly less than 10%. There were slight wording changes in this question, but inessential.',
      'buy-dips': 'The percent of the population expecting a rebound the next day should the market ever drop 3% in one day. The Buy-On-Dips Confidence Index is the number of respondents who choose 1 (increase) as a percent of those who chose 1, 2 or 3. This question was never changed.',
      'valuation': 'The percent of the population who think that the market is not too high. The Valuation Confidence Index is the number of respondents who choose 1 (Too Low) or 3 (About right) as a percentage of those who choose 1, 2, or 3. The wording of this question was never changed, and it was always the first question on the questionnaire.'
  };
  
  document.getElementById('calculation-content').innerHTML = `
      <p><strong>Question:</strong></p>
      <p>${questions[indexId]}</p>
      <p><strong>Calculation:</strong></p>
      <p>${calculations[indexId]}</p>
  `;
}

// Load and create plot
async function loadPlotData(plotType) {
    // 1) Fetch the CSV contents
    const response = await fetch('static/data/confidence_indices.csv');
    const csvData = await response.text();
  
    // 2) Split the CSV into rows, ignoring empty lines
    const rows = csvData
      .split('\n')
      .map(r => r.trim())
      .filter(r => r.length > 0)
      .map(row => row.split(','));
  
    // 3) Remove header (the first row)
    rows.shift(); // we don't need to parse the header text, since we'll use indices
  
    // 4) Define which columns (by index) to use for each confidence index
    //    We assume:
    //    - column 0 is Date
    //    - column 1,2 = 1-Year (Inst, Ind)
    //    - column 3,4 = Crash (Inst, Ind)
    //    - column 5,6 = Buy-on-Dips (Inst, Ind)
    //    - column 7,8 = Valuation (Inst, Ind)
    const colIndexMap = {
      'one-year':   { institutional: 1, individual: 2 },
      'crash':      { institutional: 3, individual: 4 },
      'buy-dips':   { institutional: 5, individual: 6 },
      'valuation':  { institutional: 7, individual: 8 }
    };
  
    // Pick which 2 columns we want based on the user's selection
    const colIndices = colIndexMap[plotType];
  
    // 5) Prepare arrays for date, institutional values, and individual values
    const xDates = [];
    const yInst = [];
    const yInd  = [];
  
    // 6) Go through each row, parse out columns
    rows.forEach(row => {
      const dateStr = row[0];  // index 0 = Date
      const valInst = parseFloat(row[colIndices.institutional]);
      const valInd  = parseFloat(row[colIndices.individual]);
  
      xDates.push(dateStr);
      yInst.push(isNaN(valInst) ? null : valInst);
      yInd.push(isNaN(valInd) ? null : valInd);
    });

    // 7) Calculate 6-month rolling averages
    function calculateRollingAverage(data, windowSize = 6) {
      const rollingAvg = [];
      for (let i = 0; i < data.length; i++) {
        if (i < windowSize - 1) {
          rollingAvg.push(null); // Not enough data points for rolling average
        } else {
          let sum = 0;
          let count = 0;
          // Look back windowSize months
          for (let j = i - windowSize + 1; j <= i; j++) {
            if (data[j] !== null && !isNaN(data[j])) {
              sum += data[j];
              count++;
            }
          }
          rollingAvg.push(count > 0 ? sum / count : null);
        }
      }
      return rollingAvg;
    }

    const yInstRolling = calculateRollingAverage(yInst, 6);
    const yIndRolling = calculateRollingAverage(yInd, 6);

    // Store the plot data for toggling
    currentPlotData = {
      xDates,
      yInst,
      yInd,
      yInstRolling,
      yIndRolling,
      plotType
    };

    // Render the plot
    renderPlot(currentPlotData);
}

// Render the plot with current data and rolling average toggle
function renderPlot(data) {
    const { xDates, yInst, yInd, yInstRolling, yIndRolling } = data;
  
    // 8) Build Plotly traces
    const traces = [];
    
    if (showRollingAverage) {
      // Show only rolling average traces
      const traceInstitutionalRolling = {
        x: xDates,
        y: yInstRolling,
        type: 'scatter',
        mode: 'lines',
        name: 'Institutional',
        line: {
          color: '#00356B',
          width: 2,
          dash: 'dash'
        }
      };
    
      const traceIndividualRolling = {
        x: xDates,
        y: yIndRolling,
        type: 'scatter',
        mode: 'lines',
        name: 'Individual',
        line: {
          color: '#FF6B6B',
          width: 2,
          dash: 'dash'
        }
      };

      traces.push(traceInstitutionalRolling, traceIndividualRolling);
    } else {
      // Show only raw monthly traces
      const traceInstitutional = {
        x: xDates,
        y: yInst,
        type: 'scatter',
        mode: 'lines',
        name: 'Institutional',
        line: {
          color: '#00356B',
          width: 2
        }
      };
    
      const traceIndividual = {
        x: xDates,
        y: yInd,
        type: 'scatter',
        mode: 'lines',
        name: 'Individual',
        line: {
          color: '#FF6B6B',
          width: 2
        }
      };

      traces.push(traceInstitutional, traceIndividual);
    }
  
    // 9) Layout and config
    const layout = {
      height: 600,
      xaxis: {
        title: '',
        showgrid: true,
        gridcolor: '#E5E5E5',
        rangeslider: {
          visible: true,
          thickness: 0.03,
          bgcolor: '#E5E5E5',
          borderwidth: 1,
          bordercolor: '#cccccc'
        },
        type: 'date',
        range: ['2001-01-01', new Date().toISOString().split('T')[0]],  // Use current date as end date
        showspikes: false
      },
      yaxis: {
        title: '',
        autorange: true,
        //range: [40, 100], // Adjust or remove for auto-scaling
        showgrid: true,
        gridcolor: '#E5E5E5',
        zeroline: false,
        fixedrange: false
      },
      font: { family: 'Open Sans, sans-serif', size: 12 },
      margin: { l: 50, r: 30, t: 100, b: 50, pad: 0 },
      showlegend: true,
      legend: {
        x: 0,
        y: 1.1,
        orientation: 'h',
        xanchor: 'left',
        font: { size: 12 }
      },
      plot_bgcolor: 'white',
      paper_bgcolor: 'white'
    };
  
    const config = {
      displayModeBar: true,
      displaylogo: false,
      responsive: true,
      modeBarButtonsToRemove: [
        'zoom2d','select2d','lasso2d','toggleSpikelines'
      ],
      toImageButtonOptions: {
        format: 'svg',
        filename: 'yale_confidence_index',
        height: 500,
        width: 700,
        scale: 1
      }
    };
  
    // 10) Render the figure
    Plotly.newPlot('plot-container', traces, layout, config);
}



// Download CSV function
function downloadCSV() {
    const link = document.createElement('a');
    link.href = 'static/data/confidence_indices.xlsx';
    link.download = 'yale_confidence_indices.xlsx';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Download CSV function
function downloadExtendedCSV() {
  const link = document.createElement('a');
  link.href = 'static/data/Extended-Index-Calculations.xlsx';
  link.download = 'Extended-Index-Calculations.xlsx';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function downloadQuestionnaire() {
  const link = document.createElement('a');
  link.href = 'static/data/US_Questions - Copy.pdf';
  link.download = 'US_Questions.pdf';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}