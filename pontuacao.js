export class ScoreManager {
    constructor(elementId = 'scoreValue') {
        this.score = 0;
        this.scoreElement = document.getElementById(elementId);

        if (!this.scoreElement) {
            console.error(`Elemento com ID '${elementId}' não encontrado para o placar.`);
        } else {
            this.updateDisplay();
        }
    }

    /**

     * @param {number} points 
     */
   addPoints(points) {
        if (typeof points !== 'number') {
            console.warn("Tentativa de adicionar pontuação inválida.");
            return;
        }
        this.score += points;
        this.updateDisplay();
    }

    /**
     * Define a pontuação para um valor específico.
     *@param {number} newScore 
     */
    setScore(newScore) {
        this.score = newScore;
         if (this.score >= 450){
            this.score = 450;
        }
        this.updateDisplay();
    }

  updateDisplay() {
        if (this.scoreElement) {
            this.scoreElement.textContent = Math.floor(this.score).toString(); 
        }
    }

    /**
     * Retorna a pontuação atual.
     * @returns {number}
     */
    getScore() {
        return this.score;
    }
}