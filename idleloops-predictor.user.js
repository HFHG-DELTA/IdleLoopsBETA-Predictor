
// ==UserScript==
// @name         IdleLoops Predictor BETA
// @namespace    https://github.com/HFHG-DELTA
// @version      1.1
// @description  Predicts the amount of resources spent and gained by each action in the action list. Valid as of IdleLoops v.94/Omsi6. Approaching valid as of BETA 01-22-2022
// @author       Koviko <koviko.net@gmail.com>
// @match        https://raw.githack.com/omsi6/omsi6.github.io/beta/loops/index.html
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// ==/UserScript==
window.eval(`
/** @namespace */
const Koviko = {
  /**
   * IdleLoops view
   * @typedef {Object} Koviko~View
   * @prop {function} updateNextActions Method responsible for updating the view
   */

  /**
   * Represents an action in the action list
   * @typedef {Object} Koviko~ListedAction
   * @prop {string} name Name of the action
   * @prop {number} loops Number of loops to perform
   */

  /**
   * IdleLoops action
   * @typedef {Object} Koviko~Action
   * @prop {string} name Name of the action
   * @prop {number} expMult Experience multiplier (typically 1)
   * @prop {number} townNum The town to which the action belongs
   * @prop {string} varName The unique identifier used for variables in the \`towns\` array
   * @prop {number} [segments] Amount of segments per loop
   * @prop {number} [dungeonNum] The dungeon to which the action belongs
   * @prop {Object.<string, number>} stats Stats that affect and are affected by the action
   * @prop {Array.<string>} [loopStats] Stats used in the respective segment per loop
   * @prop {function} manaCost Mana cost to complete the action
   */

  /**
   * IdleLoops town, which includes total progression for all actions
   * @typedef {Object} Koviko~Town
   */

  /**
   * IdleLoops dungeon floor
   * @typedef {Object} Koviko~DungeonFloor
   * @prop {number} ssChance Chance to get a soulstone
   * @prop {number} completed Amount of times completed
   */

  /**
   * IdleLoops skill
   * @typedef {Object} Koviko~Skill
   * @prop {number} exp Experience
   */

  /**
   * Globals
   * @prop {Koviko~View} view IdleLoops view object
   * @prop {Object} actions IdleLoops actions object
   * @prop {Object} Action IdleLoops Action object
   * @prop {Array.<Koviko~ListedAction>} actions.next Action List
   * @prop {HTMLElement} nextActionsDiv Action list container
   * @prop {Array.<string>} statList Names of all stats
   * @prop {Object.<string, Koviko~Skill>} skills Skill objects
   * @prop {Array.<Koviko~Town>} towns Town objects
   * @prop {Array.<Array.<Koviko~DungeonFloor>>} dungeons Dungeon objects
   * @prop {function} fibonacci Calculates the value of the given index of the Fibonacci sequence
   * @prop {function} precision3 Rounds numbers to a precision of 3
   * @prop {function} translateClassNames Converts an action name to a {@link Koviko~Action} object
   * @prop {function} getLevelFromExp Converts an amount of stat experience into a level
   * @prop {function} getSkillLevelFromExp Converts an amount of skill experience into a level
   * @prop {function} getTotalBonusXP Determine the current amount of bonus XP from talents and soulstones
   */
  globals: {
    view: null,
    actions: null,
    Action: null,
    nextActionsDiv: null,
    statList: null,
    skills: null,
    towns: null,
    dungeons: null,
    fibonacci: null,
    precision3: null,
    translateClassNames: null,
    getLevelFromExp: null,
    getSkillLevelFromExp: null,
    getTotalBonusXP: null,
  },

  /** A prediction, capable of calculating and estimating ticks and rewards of an action. */
  Prediction: class {
    /**
     * Loop attributes for a prediction
     * @typedef {Object} Koviko.Prediction~Loop
     * @prop {function} cost Cost to complete a segment
     * @prop {function} tick Amount of progress completed in one tick
     * @prop {Object} effect Effects at the end of a loop or segment
     * @prop {function} [effect.segment] Effect at the end of a segment
     * @prop {function} [effect.loop] Effect at the end of a loop
     */

    /**
     * Parameters to be passed to the Prediction constructor
     * @typedef {Object} Koviko.Prediction~Parameters
     * @prop {Array.<string>} affected Affected resources
     * @prop {function} effect Method that will mutate resources
     * @prop {Koviko.Prediction~Loop} loop Loop attributes
     */

    /**
     * Create the prediction
     * @param {string} name Name of the action
     * @param {Koviko.Prediction~Parameters} params Parameter object
     */
    constructor(name, params) {
      /**
       * Name of the action
       * @member {string}
       */
      this.name = name;

      /**
       * Action being estimated
       * @member {Koviko~Action}
       */
      this.action = Koviko.globals.translateClassNames(name);

      /**
       * The pre-calculated amount of ticks needed for the action to complete.
       * @member {number}
       */
      this._ticks = 0;

      /**
       * Resources affected by the action
       * @member {Array.<string>}
       */
      this.affected = params.affected || [];

      /**
       * Effect of the action.
       * @member {function|null}
       */
      this.effect = params.effect || null;

      /**
       * Effect(s) and tick calculations of the action's loops
       * @member {Koviko.Prediction~Loop|null}
       */
      this.loop = params.loop || null;

      this.canStart = params.canStart || true;
    }

    /**
     * Calculate the number of ticks needed to complete the action.
     * @param {Koviko.Prediction~Action} a Action object
     * @param {Koviko.Predictor~Stats} s Accumulated stat experience
     * @memberof Koviko.Prediction
     */
    updateTicks(a, s) {
      let cost = Koviko.globals.statList.reduce((cost, i) => cost + (i in a.stats && i in s ? a.stats[i] / (1 + Koviko.globals.getLevelFromExp(s[i]) / 100) : 0), 0);
      return (this._ticks = Math.ceil(a.manaCost() * cost - .000001));
    }

    /**
     * Get the pre-calculated amount of ticks needed for the action to complete.
     * @memberof Koviko.Prediction
     */
    ticks() {
      return this._ticks || this.updateTicks();
    }

    /**
     * Add the experience gained in one tick to the accumulated stat experience.
     * @param {Koviko.Prediction~Action} a Action object
     * @param {Koviko.Predictor~Stats} s Accumulated stat experience
     * @memberof Koviko.Prediction
     */
    exp(a, s) {
      Koviko.globals.statList.forEach(i => i in a.stats && i in s && (s[i] += a.stats[i] * a.expMult * (a.manaCost() / this.ticks()) * Koviko.globals.getTotalBonusXP(i)));
    }
  },

  /** A collection of attributes and a comparison of those attributes from one snapshot to the next. */
  Snapshot: class {
    /**
     * Attributes to consider from one snapshot to the next.
     * @typedef {Object.<string, number>} Koviko.Snapshot~Attributes
     */

    /**
     * Comparison of current snapshot to last snapshot.
     * @typedef {Object} Koviko.Snapshot~Comparison
     * @prop {number} value New value after the snapshot is taken
     * @prop {number} delta Difference between new value and old value
     */

    /**
     * Create the snapshot handler.
     * @param {Koviko.Snapshot~Attributes} attributes Attributes and their values
     * @memberof Koviko.Snapshot
     */
    constructor(attributes) {
      /**
       * Valid attributes for a snapshot
       * @member {Object.<string, number>}
       */
      this.attributes = {};

      /**
       * Whether the attributes have been initialized
       * @member {boolean}
       */
      this._isInitialized = false;

      if (attributes) {
        this.init(attributes);
      }
    }

    /**
     * Initialize the attributes to consider in each snapshot.
     * @param {Koviko.Snapshot~Attributes} attributes Attributes and their values
     * @return {Object.<string, Koviko.Snapshot~Comparison>} Initial comparison values
     * @memberof Koviko.Snapshot
     */
    init(attributes) {
      for (let i in attributes) {
        this.attributes[i] = { value: attributes[i], delta: 0 };
      }

      this._isInitialized = true;

      return this.attributes;
    }

    /**
     * Take a snapshot of the attributes and compare them to the previous snapshot.
     * @param {Koviko.Snapshot~Attributes} attributes Attributes and their values
     * @return {Object.<string, Koviko.Snapshot~Comparison>} Comparison values from the last snapshot to the current one
     * @memberof Koviko.Snapshot
     */
    snap(attributes) {
      if (!this._isInitialized) {
        this.init(attributes);
      }

      for (let i in this.attributes) {
        this.attributes[i].delta = attributes[i] - (this.attributes[i].value || 0);
        this.attributes[i].value = attributes[i];
      }

      return this.attributes;
    }

    /**
     * Get the snapshot.
     * @return {Object.<string, Koviko.Snapshot~Comparison>} Comparison values from the last snapshot to the current one
     * @memberof Koviko.Snapshot
     */
    get() {
      return this.attributes;
    }
  },

  /** A predictor which uses Predictions to calculate and estimate an entire action list. */
  Predictor: class {
    /**
     * Progression
     * @typedef {Object} Koviko.Predictor~Progression
     * @prop {number} completed The amount of total segments completed
     * @prop {number} progress The amount of progress in segments beyond that already represented in \`completed\`
     * @prop {number} total The amount of successful loops ever completed
     */

    /**
     * Accumulated stat experience
     * @typedef {Object.<string, number>} Koviko.Predictor~Stats
     */

    /**
     * Accumulated skill experience
     * @typedef {Object.<string, number>} Koviko.Predictor~Skills
     */

    /**
     * Accumulated resources
     * @typedef {Object.<string, number>} Koviko.Predictor~Resources
     */

    /**
     * Accumulated progress
     * @typedef {Object.<string, Koviko.Predictor~Progression>} Koviko.Predictor~Progress
     */

    /**
     * State object
     * @typedef {Object} Koviko.Predictor~State
     * @prop {Koviko.Predictor~Stats} stats Accumulated stat experience
     * @prop {Koviko.Predictor~Skills} skills Accumulated skill experience
     * @prop {Koviko.Predictor~Resources} resources Accumulated resources
     * @prop {Koviko.Predictor~Progress} progress Accumulated progress
     */

    /**
     * Create the predictor
     * @param {Koviko~View} view IdleLoops view object
     * @param {Object} actions IdleLoops actions object
     * @param {Array.<Koviko~ListedAction>} actions.next Action List
     * @param {HTMLElement} container Action list container
     */
    constructor(view, actions, container) {
      // Initialization steps broken into pieces, for my sake
      this.initStyle();
      this.initElements()
      this.initPredictions();
      if(typeof GM_getValue !== "undefined" && GM_getValue('timePercision') !== undefined) {
          var loadedVal = GM_getValue('timePercision');
          \$('#updateTimePercision').val(loadedVal);
      }

      // Prepare \`updateNextActions\` to be hooked
      if (!view._updateNextActions) {
        view._updateNextActions = view.updateNextActions;
      }

      // Hook \`updateNextActions\` with the predictor's update function
      view.updateNextActions = () => {
        view._updateNextActions();
        this.update(actions.next, container);
      };

      view.updateNextActions();
    }

    /**
     * Run a fake action list containing every possible action so that, hopefully, every function is ran at least once.
     * @memberof Koviko.Predictor
     */
    test() {
      const actions = [];

      for (const name in this.predictions) {
        actions.push({ name: name, loops: 100 });
      }

      this.update(actions, null, true);
    }

    /**
     * Build the style element responsible for the formatting of the predictor's values.
     * @memberof Koviko.Predictor
     */
    initStyle() {
      // Get the style element if it already exists for some reason
      let style = document.getElementById('koviko');

      // Build the CSS
      let css = \`
      .nextActionContainer{width:auto!important;padding:0 4px}
      #nextActionsList{height:100%!important; overflow-y:scroll;}
      #curActionsListContainer{width:24%!important; z-index: 100;}
      #nextActionsList:hover{margin-left:-40%;padding-left:40%}
      #actionList>div:nth-child(2){left: 53px !important}
      .nextActionContainer>div:first-child {min-width: 70px;}
      span.koviko{font-weight:bold;color:#8293ff}
      div.koviko{top:-5px;left:auto;right:100%}
      ul.koviko{list-style:none;margin:0;padding:0;pointer-events:none;display:inline;}
      ul.koviko li{display:inline-block;margin: 0 2px;font-weight:bold;font-size:90%}
      ul.koviko.invalid li{color:#c00!important}
      ul.koviko .mana{color:#8293ff}
      ul.koviko .gold{color:#d09249}
      ul.koviko .rep{color:#b06f37}
      ul.koviko .soul{color:#9d67cd}
      ul.koviko .herbs{color:#4caf50}
      ul.koviko .hide{color:#917a50}
      ul.koviko .potions{color:#00b2ee}
      ul.koviko .lpoitons{color:#436ef7}
      ul.koviko .blood{color:#8b0000}
      ul.koviko .crafts{color:#777777}
      ul.koviko .adventures{color:#191919}
      ul.koviko .ritual{color:#ff1493}
      ul.koviko .artifacts{color:#ffd700}
      ul.koviko .mind{color:#006400}
      ul.koviko .favors{color:#6392fe}
      ul.koviko .wizrank{color:#7303bb}
      ul.koviko .armor{color:#5B4a2a}
      .actionOptions .showthis {width:max-content;bottom:100%;max-width:400px;margin-bottom:5px;}
      .travelContainer, .actionContainer {position:relative;}
      \`;
      document.getElementById("actionsColumn").style.width="500px";

      // Create the <style> element if it doesn't already exist
      if (!style || style.tagName.toLowerCase() !== 'style') {
        style = document.createElement('style');
        style.type = 'text/css';
        style.id = 'koviko';
        document.head.appendChild(style);
      }

      // Clean out the <style> element and append the correct CSS
      for (; style.lastChild; style.removeChild(style.lastChild));
      style.appendChild(document.createTextNode(css));
    }

    /**
     * Build the element that shows the total mana required by the action list.
     * @memberof Koviko.Predictor
     */
    initElements() {
      // Find the display element for the total if it already exists
      let parent = document.getElementById('actionList').firstElementChild;

      /**
       * Element that displays the total amount of mana used in the action list
       * @member {HTMLElement}
       */
      this.totalDisplay = [...parent.children].reduce((total, el, i, arr) => total || el.className === 'koviko' && el, false);

      // If the element doesn't already exist, create it
      if (!this.totalDisplay) {
        this.totalDisplay = document.createElement('span');
        this.totalDisplay.className = 'koviko';
        this.totalDisplay.style = 'padding-left:50px;'
        parent.appendChild(this.totalDisplay);
      }

      //Adds more to the Options panel
      \$('#menu div:nth-child(4) div:first').append("<div id='preditorSettings'><br /><b>Predictor Settings</b><br />Degrees of percision on Time<input id='updateTimePercision' type='number' value='1' min='0' max='10' style='width: 50px;'></div>")
      \$('#updateTimePercision').focusout(function() {
          if(\$(this).val() > 10) {
              \$(this).val(10);
          }
          if(\$(this).val() < 1) {
              \$(this).val(1);
          }
          GM_setValue('timePercision', \$(this).val());
      });
    }

    /**
     * Build all of the necessary components to make predictions about each action.
     * @memberof Koviko.Predictor
     */
    initPredictions() {
      /**
       * Helper methods
       * @member {Object.<string, function>}
       * @namespace
       */
      this.helpers = (this.helpers || {
        /**
         * Get the level of a town attribute.
         * @param {number} exp Amount of experience in the town attribute
         * @return {number} Current level of town attribute
         * @memberof Koviko.Predictor#helpers
         */
        getTownLevelFromExp: (exp) => Math.floor((Math.sqrt(8 * exp / 100 + 1) - 1) / 2),

        /**
         * Get the current guild rank's bonus, noting that there is a max of 15 ranks, base zero.
         * @param {Koviko.Predictor~Resources} r Accumulated resources
         * @return {number} Current bonus from guild rank
         * @memberof Koviko.Predictor#helpers
         */
        getGuildRankBonus: (guild) => Math.floor(guild / 3 + .00001) >= 14 ? Math.floor(1 + 2.25 + (45 ** 2) / 300) : g.precision3(1 + guild / 20 + (guild ** 2) / 300),

        /**
         * Calculate the combat skill specifically affecting the team leader
         * @param {Koviko.Predictor~Resources} r Accumulated resources
         * @param {Koviko.Predictor~Skills} k Accumulated skills
         * @return {number} Combat skill of the team leader
         * @memberof Koviko.Predictor#helpers
         */
        getSelfCombat: (r, k) => ((g.getSkillLevelFromExp(k.combat) + g.getSkillLevelFromExp(k.pyromancy) * 5 + g.getSkillLevelFromExp(k.restoration) * 2)) * (1 + (((r.armor || 0) + 3 * (r.encArmor || 0)) * h.getGuildRankBonus(r.crafts || 0)) / 5),
        
	/**
         * Calculate the combat skill of the entire team
         * @param {Koviko.Predictor~Resources} r Accumulated resources
         * @param {Koviko.Predictor~Skills} k Accumulated skills
         * @return {number} Combat skill of the team members
         * @memberof Koviko.Predictor#helpers
         */
        getTeamCombat: (r, k) => h.getSelfCombat(r, k) + g.getSkillLevelFromExp(k.combat) * (r.team || 0) / 2 * h.getGuildRankBonus(r.adventures || 0),
      });

      // Alias the globals to a shorter variable name
      const g = Koviko.globals;
      const h = this.helpers;

      /**
       * Prediction parameters
       * @type {Object.<string, Koviko.Prediction~Parameters>}
       */
      const predictions = {
        // Beginnersville
        'Wander': {},
        'Smash Pots': { affected: ['mana'], effect: (r) => {
          r.temp1 = (r.temp1 || 0) + 1;
          r.mana += r.temp1 <= towns[0].goodPots ? g.Action.SmashPots.goldCost() : 0;
        }},
        'Pick Locks': { affected: ['gold'], effect: (r) => {
          r.temp2 = (r.temp2 || 0) + 1;
          r.gold += r.temp2 <= towns[0].goodLocks ? g.Action.PickLocks.goldCost() : 0;
        }},
        'Buy Glasses': { effect: (r) => (r.gold -= 10, r.glasses = true) },



        'Buy Mana Z1': { affected: ['mana', 'gold'], effect: (r) => (r.mana += r.gold * Math.floor(50 * Math.pow(1 + getSkillLevel("Mercantilism") / 60 , 0.25)), r.gold = 0) },
        'Meet People': {},
        'Train Strength': {},
        'Short Quest': { affected: ['gold'], effect: (r) => {
          r.temp3 = (r.temp3 || 0) + 1;
          r.gold += r.temp3 <= towns[0].goodSQuests ? g.Action.ShortQuest.goldCost() : 0;
        }},
        'Investigate': {},
        'Long Quest': { affected: ['gold', 'rep'], effect: (r) => {
          r.temp4 = (r.temp4 || 0) + 1;
          r.gold += r.temp4 <= towns[0].goodLQuests ? g.Action.LongQuest.goldCost() : 0;
          r.rep += r.temp4 <= towns[0].goodLQuests ? 1 : 0;
        }},
        'Throw Party': { affected: ['rep'], effect: (r) => r.rep -= 2 },
        'Warrior Lessons': { effect: (r, k) => k.combat += 100, canStart: (input) => input.rep >= 2 },
        'Mage Lessons': { effect: (r, k) => k.magic += 100 * (1 + g.getSkillLevelFromExp(k.alchemy) / 100), canStart: (input) => input.rep >= 2 },
        'Buy Supplies': { affected: ['gold'], effect: (r) => (r.gold -= 300 - Math.max((r.supplyDiscount || 0) * 20, 0), r.supplies = (r.supplies || 0) + 1), canStart: (input) => input.gold >= 300 - Math.max((input.supplyDiscount || 0) * 20, 0) },
        'Haggle': { affected: ['rep'], canStart: (input) => (input.rep > 0), effect: (r) => (r.rep--, r.supplyDiscount = (r.supplyDiscount >= 15 ? 15 : (r.supplyDiscount || 0) + 1)) },
        'Start Journey': { effect: (r) => (r.supplies = (r.supplies || 0) - 1, r.town += 1), canStart: r => r.supplies >= 1},

        // Forest Path
        'Explore Forest': {},
        'Wild Mana': { affected: ['mana'], effect: (r) => {
          r.temp5 = (r.temp5 || 0) + 1;
          r.mana += r.temp5 <= towns[1].goodWildMana ? g.Action.WildMana.goldCost() : 0;
        }},
        'Gather Herbs': { affected: ['herbs'], effect: (r) => {
          r.temp6 = (r.temp6 || 0) + 1;
          r.herbs += r.temp6 <= towns[1].goodHerbs ? 1 : 0;
        }},
        'Hunt': { affected: ['hide'], effect: (r) => {
          r.temp7 = (r.temp7 || 0) + 1;
          r.hide += r.temp7 <= towns[1].goodHunt ? 1 : 0;
        }},
        'Sit By Waterfall': {},
        'Old Shortcut': {},
        'Talk To Hermit': {},
        'Practical Magic': { effect: (r, k) => k.practical += 100 },
        'Learn Alchemy': { affected: ['herbs'], canStart: (input) => (input.herbs >= 10), effect: (r, k) => (r.herbs -= 10, k.alchemy += 50, k.magic += 50) },
        'Brew Potions': { affected: ['herbs', 'potions'], canStart: (input) => (input.herbs >= 10 && input.rep >= 5), effect: (r, k) => (r.herbs -= 10, r.potions++, k.alchemy += 25, k.magic += 50) },
        'Train Dexterity': {},
        'Train Speed': {},
        'Follow Flowers': {},
        'Bird Watching': {canStart: (input) => input.glasses},
        'Clear Thicket': {},
        'Talk To Witch': {},
        'Dark Magic': { affected: ['rep'], canStart: (input) => (input.rep <= 0), effect: (r, k) => (r.rep--, k.dark += Math.floor(100 * (1 + buffs.Ritual.amt / 100))) },
        'Continue On': { effect: (r) => r.town += 1 },

        // Merchanton
        'Explore City': {},
        'Gamble': { affected: ['gold', 'rep'], canStart: (input) => (input.rep >= -5 && input.gold >= 20), effect: (r) => {
          r.temp8 = (r.temp8 || 0) + 1;
          r.gold += r.temp8 <= towns[2].goodGamble ? 40 : -20;
          r.rep--;
        }},
        'Get Drunk': { affected: ['rep'], canStart: (input) => (input.rep >= -3), effect: (r) => r.rep-- },
        'Buy Mana Z3': { affected: ['mana', 'gold'], effect: (r) => (r.mana += r.gold * Math.floor(50 * Math.pow(1 + getSkillLevel("Mercantilism") / 60 , 0.25)), r.gold = 0) },
        'Sell Potions': { affected: ['gold', 'potions'], effect: (r, k) => (r.gold += r.potions * g.getSkillLevelFromExp(k.alchemy), r.potions = 0) },
        'Read Books': {},
        'Gather Team': { affected: ['gold'], effect: (r) => (r.team = (r.team || 0) + 1, r.gold -= r.team * 100) },
        'Craft Armor': { affected: ['armor', 'hide'], canStart: (input) => (input.hide >= 2), effect: (r) => (r.hide -= 2, r.armor = (r.armor || 0) + 1) },
        'Apprentice': { effect: (r, k) => (r.apprentice = (r.apprentice || 0) + 30 * h.getGuildRankBonus(r.crafts || 0), k.crafting += 10 * (1 + h.getTownLevelFromExp(r.apprentice) / 100)) },
        'Mason': { effect: (r, k) => (r.mason = (r.mason || 0) + 20 * h.getGuildRankBonus(r.crafts || 0), k.crafting += 20 * (1 + h.getTownLevelFromExp(r.mason) / 100)) },
        'Architect': { effect: (r, k) => (r.architect = (r.architect || 0) + 10 * h.getGuildRankBonus(r.crafts || 0), k.crafting += 40 * (1 + h.getTownLevelFromExp(r.architect) / 100)) },
        'Buy Pickaxe': { affected: ['gold'], effect: (r) => (r.gold -= 200, r.pickaxe = true) },
        'Start Trek': { effect: (r) => r.town += 1 },

        // Mt. Olympus
        'Climb Mountain': {},
        'Mana Geyser': { affected: ['mana'], canStart: (input) => input.pickaxe, effect: (r) => {
          r.temp9 = (r.temp9 || 0) + 1;
          r.mana += r.temp9 <= towns[3].goodGeysers ? 5000 : 0;
        }},
        'Decipher Runes': {},
        'Chronomancy': { effect: (r, k) => k.chronomancy += 100 },
        'Explore Cavern': {},
        'Mine Soulstones': { affected: ['soul'], effect: (r) => {
          r.temp10 = (r.temp10 || 0) + 1;
          r.soul += r.temp10 <= towns[3].goodMineSoulstones ? 1 : 0;
        }},
        'Pyromancy': { effect: (r, k) => k.pyromancy += 100 },
        'Looping Potion': { affected: ['herbs', 'lpotions'], effect: (r, k) => {
          if ( r.herbs >= 200 ) {
            (r.herbs -= 200, r.lpoitons++, k.alchemy += 100)
          }
        }},
        'Check Walls': {},
        'Take Artifacts': { affected: ['artifacts'], effect: (r) => {
          r.temp11 = (r.temp11 || 0) + 1;
          r.artifacts += r.temp11 <= towns[3].goodArtifacts ? 1 : 0;
        }},
        'Face Judgement': { effect: (r) => r.town += 1 },

        // Town 5  Valhalla
        'Buy Mana Z5': { affected: ['mana', 'gold'], effect: (r) => (r.mana += r.gold * Math.floor(50 * Math.pow(1 + getSkillLevel("Mercantilism") / 60 , 0.25)), r.gold = 0) },
        'Fall From Grace': {},
        'Guided Tour': { affected: ['gold'], effect: (r) => (r.gold -= 10) },
        'Seek Citizenship': {},
        'Canvass': {},
        'Donate': { affected: ['gold', 'rep'], canStart: (input) => (input.gold >= 20), effect: (r) => {
          r.gold -= 20;
          r.rep += 1;
        }},
        'Accept Donations': {affected: ['gold', 'rep'], canStart: (input) => (input.rep >= 1), effect: (r) => {
          r.temp12 = (r.temp12 || 0) + 1;
          if (r.temp12 <= towns[4].goodDonations) {
            r.rep -= 1;
            r.gold += 20;
           }
	 }},
        'Sell Artifact': { affected: ['artifacts','gold'], canStart: (input) => (input.artifacts >= 1), effect: (r) => {
         r.artifacts -= 1;
         r.gold += 50;
        }},
        'Gift Artifact': { affected: ['artifacts','favors'], canStart: (input) => (input.artifacts >= 1), effect: (r) => {
         r.artifacts -= 1;
         r.favors += 1;
        }},
        'Mercantilism': { effect: (r, k) => k.mercantilism += 100 },
        'Charm School': {},
        'Oracle': {},
        'Pegasus': { affected: ['gold','favors'], canStart: (input) => (input.favors >= 10, input.gold >= 100), effect: (r) => {
         r.favors -= 10;
         r.gold -= 100;
        }},
        'Great Feast': {},
        'Collect Taxes': {},
        'Acquire Permit': {},
        'Purchase Land': { affected: ['gold'], canStart: (input) => (input.gold >= 50), effect: (r) => {
         r.gold -= 50;}
        },
        'Build Housing': {},
        'Restoration': { effect: (r, k) => k.restoration += 100 },
        'Spatiomancy': { effect: (r, k) => k.spatiomancy += 100 },
        'Enchant Armor': { affected: ['armor', 'favors'], canStart: (input) => (input.armor >= 1, input.favors >= 1), effect: (r) => {
          r.armor -= 1;
          r.favors -= 1;
          r.encArmor = (r.encArmor || 0) + 1
        }},
        'Open Rift':{},
	
         // Town 5  Adeptsville
        'The Spire': { affected: ['spire'], loop: {
          cost: (p, a) => segment => g.precision3(Math.pow(2, Math.floor((p.completed + segment) / a.segments + .0000001)) * 10e6),
          tick: (p, a, s, k, r) => offset => ((h.getSelfCombat(r, k) + g.getSkillLevelFromExp(k.magic)) * Math.sqrt(1 + p.total/200) * (1 + g.getLevelFromExp(s[a.loopStats[(p.completed + offset) % a.loopStats.length]])/100)),
          effect: { loop: (r) => (r.spire++) }
        }},



        // Loops without Max
        'Heal The Sick': { affected: ['rep'], canStart: (input) => (input.rep >= 1), loop: {
          cost: (p, a) => segment => g.fibonacci(2 + Math.floor((p.completed + segment) / a.segments + .0000001)) * 5000,
          tick: (p, a, s, k) => offset => g.getSkillLevelFromExp(k.magic) * Math.sqrt(1 + p.total / 100) * (1 + g.getLevelFromExp(s[a.loopStats[(p.completed + offset) % a.loopStats.length]]) / 100),
          effect: { end: (r, k) => k.magic += 10, loop: (r) => r.rep += 3 },
        }},
        'Fight Monsters': { affected: ['gold'], canStart: (input) => (input.rep >= 2), loop: {
          cost: (p, a) => segment => g.fibonacci(Math.floor((p.completed + segment) - p.completed / a.segments + .0000001)) * 10000,
          tick: (p, a, s, k, r) => offset => h.getSelfCombat(r, k) * Math.sqrt(1 + p.total / 100) * (1 + g.getLevelFromExp(s[a.loopStats[(p.completed + offset) % a.loopStats.length]]) / 100),
          effect: { end: (r, k) => k.combat += 10, segment: (r) => r.gold += 20 },
        }},
        'Adventure Guild': { affected: ['gold', 'adventures'], loop: {
          cost: (p) => segment => g.precision3(Math.pow(1.2, p.completed + segment)) * 5e6,
          tick: (p, a, s, k, r) => offset => (h.getSelfCombat(r, k) + g.getSkillLevelFromExp(k.magic) / 2) * (1 + g.getLevelFromExp(s[a.loopStats[(p.completed + offset) % a.loopStats.length]]) / 100) * Math.sqrt(1 + p.total / 1000),
          effect: { segment: (r) => (r.mana += 200, r.adventures++) }
        }},
        'Crafting Guild': { affected: ['gold', 'crafts'], loop: {
          cost: (p) => segment => g.precision3(Math.pow(1.2, p.completed + segment)) * 2e6,
          tick: (p, a, s, k) => offset => (g.getSkillLevelFromExp(k.magic) / 2 + g.getSkillLevelFromExp(k.crafting)) * (1 + g.getLevelFromExp(s[a.loopStats[(p.completed + offset) % a.loopStats.length]]) / 100) * Math.sqrt(1 + p.total / 1000),
          effect: { segment: (r, k) => (r.gold += 10, r.crafts++, k.crafting += 50) }
        }},
        'Wizard College': { affected: ['gold', 'favors', 'wizrank'],
          canStart: (input) => (input.gold >= 500, input.favors >=10),
          effect: (input) => (input.gold -=500, input.favors -=10),
          loop: {
            cost: (p) => segment => g.precision3(Math.pow(1.3, p.completed + segment)) * 1e7,
            tick: (p, a, s, k) => offset => (
	      (g.getSkillLevelFromExp(k.magic) + g.getSkillLevelFromExp(k.practical) + g.getSkillLevelFromExp(k.dark) + g.getSkillLevelFromExp(k.chronomancy) + 
	        g.getSkillLevelFromExp(k.pyromancy) + g.getSkillLevelFromExp(k.restoration) + g.getSkillLevelFromExp(k.spatiomancy)) * 
	      (1 + g.getLevelFromExp(s[a.loopStats[(p.completed + offset) % a.loopStats.length]]) / 100) * Math.sqrt(1 + p.total / 1000)
	    ),
          effect: { 
            segment: (r) => (r.wizrank++),
            end: (r, k, ps) => (
              ps['Restoration'].action.manaCost = () => 15000 / precision3(1 + 0.02 * Math.pow(r.wizrank, 1.05)),
              ps['Spatiomancy'].action.manaCost = () => 20000 / precision3(1 + 0.02 * Math.pow(r.wizrank, 1.05))
            )
          }
        }},
        'Hunt Trolls': { affected: ['blood'], loop: {
          cost: (p, a) => segment => g.precision3(Math.pow(2, Math.floor((p.completed + segment) / a.segments+.0000001)) * 1e6),
          tick: (p, a, s, k, r) => offset => (h.getSelfCombat(r, k) * Math.sqrt(1 + p.total/100) * (1 + g.getLevelFromExp(s[a.loopStats[(p.completed + offset) % a.loopStats.length]])/100)),
          effect: { loop: (r, k) => (r.blood++, k.combat += 1000) }
        }},


        ////////////////////////////////
        'Tidy Up': { affected: ['gold'], loop: {
          cost: (p, a) => segment => g.fibonacci(Math.floor((p.completed + segment) - p.completed / 3 + .0000001)) * 1000000,
          tick: (p, a, s, k) => offset => g.getSkillLevelFromExp(k.practical) * Math.sqrt(1 + p.total / 100) * (1 + g.getLevelFromExp(s[a.loopStats[(p.completed + offset) % a.loopStats.length]]) / 100),
          effect: { loop: (r) => (r.gold += 30)}
        }},




        ///////////////////////////////
        // Loops with Max
        'Small Dungeon': { affected: ['soul'], canStart: (input) => input.rep >= 2, loop: {
          max: (a) => g.dungeons[a.dungeonNum].length,
          cost: (p, a) => segment => g.precision3(Math.pow(2, Math.floor((p.completed + segment) / a.segments + .0000001)) * 15000),
          tick: (p, a, s, k, r) => offset => {
            let floor = Math.floor(p.completed / a.segments + .0000001);

            return floor in g.dungeons[a.dungeonNum] ? (h.getSelfCombat(r, k) + g.getSkillLevelFromExp(k.magic)) * (1 + g.getLevelFromExp(s[a.loopStats[(p.completed + offset) % a.loopStats.length]]) / 100) * Math.sqrt(1 + g.dungeons[a.dungeonNum][floor].completed / 200) : 0;
          },
          effect: { end: (r, k) => (k.combat += 5, k.magic += 5), loop: (r) => r.soul++ },
        }},
        'Large Dungeon': { affected: ['soul'], loop: {
          max: (a) => g.dungeons[a.dungeonNum].length,
          cost: (p, a) => segment => g.precision3(Math.pow(3, Math.floor((p.completed + segment) / a.segments + .0000001)) * 5e5),
          tick: (p, a, s, k, r) => offset => {
            let floor = Math.floor(p.completed / a.segments + .0000001);

            return floor in g.dungeons[a.dungeonNum] ? (h.getTeamCombat(r, k) + g.getSkillLevelFromExp(k.magic)) * (1 + g.getLevelFromExp(s[a.loopStats[(p.completed + offset) % a.loopStats.length]]) / 100) * Math.sqrt(1 + g.dungeons[a.dungeonNum][floor].completed / 200) : 0;
          },
          effect: { end: (r, k) => (k.combat += 15, k.magic += 15), loop: (r) => r.soul += 10 }
        }},
        'Dark Ritual': { affected: ['ritual'], canStart: (input) => (input.rep <= -5), loop: {
          max: () => 1,
          cost: (p) => segment => 1000000 * (segment * 2 + 1),
          tick: (p, a, s, k) => offset => {
            let attempt = Math.floor(p.completed / a.segments + .0000001);

            return attempt < 1 ? (g.getSkillLevelFromExp(k.dark) * (1 + g.getLevelFromExp(s[a.loopStats[(p.completed + offset) % a.loopStats.length]]) / 100)) / (1 - towns[1].getLevel("Witch") * .005) : 0;
          },
          effect: { loop: (r) => r.ritual++ }
        }},
        'Imbue Mind': { affected: ['mind'], loop: {
          max: () => 1,
          cost: (p) => segment => 100000000 * (segment * 5 + 1),
          tick: (p, a, s, k) => offset => {
            let attempt = Math.floor(p.completed / a.segments + .0000001);

            return attempt < 1 ? (g.getSkillLevelFromExp(k.magic) * (1 + g.getLevelFromExp(s[a.loopStats[(p.completed + offset) % a.loopStats.length]]) / 100)) : 0;
          },
          effect: { loop: (r) => r.mind++ },
        }},
      };

      /**
       * Prediction collection
       * @member {Object.<string, Prediction>}
       */
      this.predictions = {};

      // Create predictions
      for (const name in predictions) {
        this.predictions[name] = new Koviko.Prediction(name, predictions[name]);
      }
    }

    /**
     * Update the action list view.
     * @param {Array.<IdleLoops~ListedAction>} actions Actions in the action list
     * @param {HTMLElement} [container] Parent element of the action list
     * @param {boolean} [isDebug] Whether to log useful debug information
     * @memberof Koviko.Predictor
     */
    update(actions, container, isDebug) {
      /**
       * Organize accumulated resources, accumulated stats, and accumulated progress into a single object
       * @var {Koviko.Predictor~State}
       */
      const state = {
        resources: { mana: 250, town: 0 },
        stats: Koviko.globals.statList.reduce((stats, name) => (stats[name] = 0, stats), {}),
        skills: Object.entries(Koviko.globals.skills).reduce((skills, x) => (skills[x[0].toLowerCase()] = x[1].exp, skills), {}),
        progress: {},
        currProgress: {}
      };

      /**
       * Snapshots of accumulated stats and accumulated skills
       * @var {Object}
       * @prop {Koviko.Snapshot} stats Snapshot of accumulated stats
       * @prop {Koviko.Snapshot} skills Snapshot of accumulated skills
       */
      const snapshots = {
        stats: new Koviko.Snapshot(state.stats),
        skills: new Koviko.Snapshot(state.skills),
        currProgress: new Koviko.Snapshot({"Fight Monsters": 0, "Heal The Sick": 0, "Small Dungeon": 0, "Large Dungeon": 0, "Hunt Trolls": 0})
      };

      /**
       * Total mana used for the action list
       * @var {number}
       */
      let total = 0;

      /**
       * Total time used for the action list
       * @var {number}
       */
      let totalTicks = 0;

      /**
       * All affected resources of the current action list
       * @var {Array.<string>}
       */
      const affected = Object.keys(actions.reduce((stats, x) => (x.name in this.predictions && this.predictions[x.name].affected || []).reduce((stats, name) => (stats[name] = true, stats), stats), {}));


      /**
       *This is used to see when the loop becomes invalid due to mana cost
       */
      //This is the percision of the Time field
      let percisionForTime = \$('#updateTimePercision').val();

      // Initialize all affected resources
      affected.forEach(x => state.resources[x] || (state.resources[x] = 0));

      // Initialize the display element for the total amount of mana used
      container && (this.totalDisplay.innerHTML = '');

      for (const [_, prediction] of Object.entries(this.predictions)) { prediction.loopsCompleted = 0; }

      // Run through the action list and update the view for each action
      actions.forEach((listedAction, i) => {
        /** @var {Koviko.Prediction} */
        let prediction = this.predictions[listedAction.name];

        if (prediction) {
          /**
           * Element for the action in the list
           * @var {HTMLElement}
           */
          let div = container ? container.children[i] : null;

          /** @var {boolean} */
          let isValid = true;

          /** @var {number} */
          let currentMana;

          // Make sure that the loop is properly represented in \`state.progress\`
          if (prediction.loop && !(prediction.name in state.progress)) {
            /** @var {Koviko.Predictor~Progression} */
            state.progress[prediction.name] = {
              progress: 0,
              completed: 0,
              total: Koviko.globals.towns[prediction.action.townNum]['total' + prediction.action.varName],
            };
          }

          // Predict each loop in sequence
                    let repeatLoop = options.repeatLastAction && i == actions.length - 1;
          let loop = 0;
          for (loop = 0; repeatLoop ? isValid : loop < listedAction.loops; loop++) {
            let canStart = typeof(prediction.canStart) === "function" ? prediction.canStart(state.resources) : prediction.canStart;
            if (!canStart) { isValid = false; }
            if ( !canStart || listedAction.disabled ) { break; }

            // Save the mana prior to the prediction
            currentMana = state.resources.mana;

            // Run the prediction
            this.predict(prediction, state);

            // Check if the amount of mana used was too much
            isValid = isValid && state.resources.mana >= 0;

            // Only for Adventure Guild
            if ( listedAction.name == "Adventure Guild" ) {
              state.resources.mana -= state.resources.adventures * 200;
            }

            // Calculate the total amount of mana used in the prediction and add it to the total
            total += currentMana - state.resources.mana;

            // Calculate time spent
            let temp = (currentMana - state.resources.mana) / Math.pow(1 + getSkillLevel("Chronomancy") / 60, 0.25);
            if ( state.resources.town === 0 && getBuffLevel("Ritual") > 0) {
              temp /= (1 + Math.min(getBuffLevel("Ritual"), 20) / 10);
            }
            else if ( state.resources.town === 1 && getBuffLevel("Ritual") > 20) {
              temp /= (1 + Math.min(getBuffLevel("Ritual") - 20, 20) / 20);
            }
            else if ( state.resources.town === 2 && getBuffLevel("Ritual") > 40) {
              temp /= (1 + Math.min(getBuffLevel("Ritual") - 40, 20) / 40);
            }
            totalTicks += temp;

            // Only for Adventure Guild
            if ( listedAction.name == "Adventure Guild" ) {
              state.resources.mana += state.resources.adventures * 200;
            }

            // Run the effect, now that the mana checks are complete
            if (prediction.effect) {
              prediction.effect(state.resources, state.skills);
            }
            if (prediction.loop) {
              if (prediction.loop.effect.end) {
                prediction.loop.effect.end(state.resources, state.skills, this.predictions);
              }
            }
            prediction.loopsCompleted += 1;
          }

          if(prediction.name in state.progress)
            state.currProgress[prediction.name] = state.progress[prediction.name].completed / prediction.action.segments;

          // Update the snapshots
          for (let i in snapshots) {
            snapshots[i].snap(state[i]);
          }

          // Update the view
          if (div) {
            div.className += ' showthat';
                        if ( repeatLoop ) {
              let t = div.children[0];
              t.innerHTML += \` <div><ul class="koviko"><li style='color:#bbbbbb;'>\${loop}</li></ul></div>\`
            }

            let text = document.createElement("div");
            text.innerHTML = this.template(listedAction.name, affected, state.resources, snapshots, isValid);
            text.setAttribute("style", "margin-right: auto;");
            div.insertBefore(text, div.children[1]);
          }
        }
      });

      // Update the display for the total amount of mana used by the action list
      totalTicks = totalTicks/gameSpeed
      totalTicks /= 50;
      var h = Math.floor(totalTicks / 3600);
      var m = Math.floor(totalTicks % 3600 / 60);
      var s = Math.floor(totalTicks % 3600 % 60);
      var ms = Math.floor(totalTicks % 1 * Math.pow(10,percisionForTime));
      while(ms.toString().length < percisionForTime) { ms = "0" + ms; }

      let totalTime = ('0' + h).slice(-2) + ":" + ('0' + m).slice(-2) + ":" + ('0' + s).slice(-2) + "." + ms;
      let dungeonEquilibrium = Math.sqrt(total / 200000);
      let dungeonSoulStones = snapshots.currProgress.attributes["Small Dungeon"].value + snapshots.currProgress.attributes["Large Dungeon"].value * 10;
      let expectedSoulStones = dungeonEquilibrium * dungeonSoulStones + this.predictions["Mine Soulstones"].loopsCompleted;
      let soulStonesPerMinute = expectedSoulStones / totalTicks * 60;
      container && (this.totalDisplay.innerHTML = intToString(total) + " | x" + gameSpeed + " | " + totalTime + " | " + soulStonesPerMinute.toFixed(2) + " SS/min");

      // Log useful debugging data
      if (isDebug) {
        console.info({
          actions: actions,
          affected: affected,
          state: state,
          total: total
        });
      }
    }

    /**
     * Generate the element showing the resources accumulated for an action in the action list.
     * @param {Array.<string>} affected Names of resources to display
     * @param {string} currname Name of the snapshot on hoverover
     * @param {Koviko.Predictor~Resources} resources Accumulated resources
     * @param {Object} snapshots Snapshots with value comparisons
     * @param {Koviko.Snapshot} snapshots.stats Value comparisons of stats from one snapshot to the next
     * @param {Koviko.Snapshot} snapshots.skills Value comparisons of skills from one snapshot to the next
     * @param {boolean} isValid Whether the amount of mana remaining is valid for this action
     * @return {string} HTML of the new element
     * @memberof Koviko.Predictor
     */
    template(currname, affected, resources, snapshots, isValid) {
      isValid = isValid ? 'valid' : 'invalid';
      let stats = snapshots.stats.get();
      let skills = snapshots.skills.get();
      let currProgress = snapshots.currProgress.get();
      let tooltip = '<tr><th colspan="3"><b>' + currname + '</b></th><tr>';

      for (let i in stats) {
        if (stats[i].delta) {
          let level = {
            start: Koviko.globals.getLevelFromExp(stats[i].value - stats[i].delta),
            end: Koviko.globals.getLevelFromExp(stats[i].value),
          };

          tooltip += '<tr><td><b>' + _txt(\`stats>\${i}>short_form\`).toUpperCase() + '</b></td><td>' + intToString(level.end, 1) + '</td><td>(+' + intToString(level.end - level.start, 1) + ')</td></tr>';
        }
      }

      for (let i in skills) {
        if (skills[i].delta) {
          let level = {
            start: Koviko.globals.getSkillLevelFromExp(skills[i].value - skills[i].delta),
            end: Koviko.globals.getSkillLevelFromExp(skills[i].value),
          };

          tooltip += '<tr><td><b>'
          switch(i) {
            case "chronomancy":
              tooltip += 'CHRO';
              break;
            case "crafting":
              tooltip += 'CRAFT';
              break;
            case "pyromancy":
              tooltip += 'PYRO';
              break;
            case "alchemy":
              tooltip += 'ALCH';
              break;
            case "combat":
              tooltip += 'COMB';
              break;
            case "practical":
              tooltip += 'PRACT';
              break;
            case "mercantilism":
              tooltip += 'MERC';
              break;
            case "restoration":
              tooltip += 'RESTO';
              break;
            case "spatiomancy":
              tooltip += 'SPATIO';
              break;
            default:
              tooltip += i.toUpperCase();
          }
          tooltip += '</b></td><td>' + intToString(level.end, 1) + '</td><td>(+' + intToString(level.end - level.start, 1) + ')</td></tr>';
        }
      }

      for (let i in currProgress) {
        if (currProgress[i].delta) {
          let level = {
            start: currProgress[i].value - currProgress[i].delta,
            end: currProgress[i].value,
          };

          tooltip += '<tr><td><b>'
          switch(i) {
            case "Fight Monsters":
              tooltip += 'MON';
              break;
            case "Heal The Sick":
              tooltip += 'PT';
              break;
            case "Small Dungeon":
              tooltip += 'SD';
              break;
            case "Large Dungeon":
              tooltip += 'LD';
              break;
            case "Hunt Trolls":
              tooltip += 'TROL';
              break;
            default:
              tooltip += i.toUpperCase();
          }
          tooltip += '</b></td><td>' + intToString(level.end, 1) + '</td><td>(+' + intToString(level.end - level.start, 1) + ')</td></tr>';
        }
      }

      var Affec = affected.map(name => {
        if ( resources[name] != 0 ) return \`<li class=\${name}>\${resources[name]}</li>\`;
        else return "";
      }).join('');
      return \`<ul class='koviko \${isValid}'>\` + Affec + \`</ul><div class='koviko showthis'><table>\${tooltip || '<b>N/A</b>'}</table></div>\`;
    };

    /**
     * Perform one tick of a prediction.
     * @param {Koviko.Prediction} prediction Prediction object
     * @param {Koviko.Predictor~State} state State object
     * @return {boolean} Whether another tick can occur
     * @memberof Koviko.Predictor
     */
    tick(prediction, state) {
      // Apply the accumulated stat experience
      prediction.exp(prediction.action, state.stats);

      // Handle the loop if it exists
      if (prediction.loop) {
        /** @var {Koviko.Predictor~Progression} */
        const progression = state.progress[prediction.name];

        /** @var {function} */
        const loopCost = prediction.loop.cost(progression, prediction.action);

        /** @var {function} */
        const tickProgress = prediction.loop.tick(progression, prediction.action, state.stats, state.skills, state.resources);

        /** @var {number} */
        const totalSegments = prediction.action.segments;

        /** @var {number} */
        const maxSegments = prediction.loop.max ? prediction.loop.max(prediction.action) * totalSegments : Infinity;

        /**
         * Current segment within the loop
         * @var {number}
         */
        let segment = 0;

        /**
         * Progress through the current loop
         * @var {number}
         */
        let progress = progression.progress;

        // Calculate the progress and current segment before the tick
        for (; progress >= loopCost(segment); progress -= loopCost(segment++));

        /**
         * Progress of the tick
         * @var {number}
         */
        let additionalProgress = tickProgress(segment) * (prediction.action.manaCost() / prediction.ticks());

        // Accumulate the progress from the tick
        progress += additionalProgress;
        progression.progress += additionalProgress;

        // Calculate the progress and current segment after the tick
        while (progress >= loopCost(segment) && progression.completed < maxSegments) {
          progress -= loopCost(segment++)
          // Handle the completion of a loop
          if (segment >= totalSegments) {
            progression.progress = 0;
            progression.completed += totalSegments;
            progression.total++;
            segment -= totalSegments;

            // Apply the effect from the completion of a loop
            if (prediction.loop.effect.loop) {
              prediction.loop.effect.loop(state.resources, state.skills);
            }

            // Store remaining progress in next loop if next loop is allowed
            if (progression.completed < maxSegments) {
              progression.progress = progress;
            }
          }

          // Apply the effect from the completion of a segment
          if (prediction.loop.effect.segment) {
            prediction.loop.effect.segment(state.resources, state.skills);
          }
        }

        return additionalProgress && segment < maxSegments;
      }

      return true;
    }

    /**
     * Perform all ticks of a prediction
     * @param {Koviko.Prediction} prediction Prediction object
     * @param {Koviko.Predictor~state} state State object
     * @memberof Koviko.Predictor
     */
    predict(prediction, state) {
      // Update the amount of ticks necessary to complete the action, but only once at the start of the action
      prediction.updateTicks(prediction.action, state.stats);

      // Perform all ticks in succession
      for (let ticks = 0; ticks < prediction.ticks(); ticks++) {
        state.resources.mana--;
        if (state.resources.mana >= 0) {
            if (!this.tick(prediction, state)) break;
        }
      }
    }
  },

  hasRan: false,
  run: () => {
    if (!Koviko.hasRan) {
      Koviko.hasRan = true;
      for (let varName in Koviko.globals) {
        try {
          Koviko.globals[varName] = eval(varName);
        } catch (e) {
          console.error(\`Unable to retrieve global '\${varName}'.\`);
          Koviko.hasRan = false;
          return;
        }
      }

      window.Koviko = new Koviko.Predictor(Koviko.globals.view, Koviko.globals.actions, Koviko.globals.nextActionsDiv);
    }
  }
};

// Run the code!
//window.addEventListener('load', Koviko.run);
setTimeout(() => document.readyState == 'complete' && Koviko.run(), 2000); // If it hasn't already ran in a couple of seconds, see if it can run
`);
