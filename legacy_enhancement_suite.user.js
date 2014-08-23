/**
 * Copyright (C) 2014 Rodrigo Muñoz <rod@rmk.pw>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

// ==UserScript==
// @name        Legacy Enhancement Suite
// @namespace   LES
// @description Improvements to Legacy Game
// @include     http://www.legacy-game.net/*
// @include     http://dev.legacy-game.net/*
// @version     0.0.12
// @require     http://cdnjs.cloudflare.com/ajax/libs/jquery/2.1.1/jquery.js
// @require     http://locachejs.org/build/locache.js
// @require     http://cdnjs.cloudflare.com/ajax/libs/mousetrap/1.4.6/mousetrap.js
// @require     http://cdnjs.cloudflare.com/ajax/libs/underscore.js/1.6.0/underscore.js
// @require     http://cdnjs.cloudflare.com/ajax/libs/URI.js/1.11.2/URI.min.js
// ==/UserScript==

// =============================================================================
//                              Script Set-Up
// =============================================================================
// Avoid conflicting with page's jQuery
this.$ = this.jQuery = jQuery.noConflict(true);
// Clear out expired cache values
locache.cleanup();

// =============================================================================
//                            Primary Entry Point
// =============================================================================
/**
 * Registers a function to be executed on pages where the path matches path
 * rules, where path_rules is an array of regexes. For example,
 * registerFunction(foo, ['bar.php', 'baz.php']) will register foo to be run
 * on bar.php and baz.php.
 */
var function_registry = {};
function registerFunction(fn, path_rules) {
  $.each(path_rules, function(i, rule) {
    if (rule in function_registry) {
      function_registry[rule].push(fn);
    } else {
      function_registry[rule] = [fn];
    }
  });
}

/**
 * Executes registered functions based on current path.
 */
function executeFunctions() {
  var current_path = window.location.pathname;
  $.each(function_registry, function(rule, fns) {
    if (current_path.match(rule)) {
      $.each(fns, function(i, fn) { fn(); });
    }
  });
}
$(document).ready(executeFunctions);

// =============================================================================
//                               General Layout
// =============================================================================
/**
 * FEATURE: If there's a quick link to hospital/sanctuary of healing, adds a
 * 'heal' link (actually an ajax call) right next to it.
 */
registerFunction(function addQuickHealLink() {
  var hospital_node = $('a[href="hospital.php"]');
  var heal_me_link = $('<a>', { text: ' (Heal)', href: '#' });
  heal_me_link.click(function() { fullHeal(); return false; });
  hospital_node.after(heal_me_link);
}, [ ".*" ]);

/**
 * FEATURE: Binds 'h' to full heal.
 */
registerFunction(function addQuickHealKeybinding() {
  Mousetrap.bind('h', fullHeal);
}, [ ".*" ]);

/**
 * @return {string} Secret key use for Hospital operations
 */
function getHospitalKey() {
  return cachedFetch("hospital:key", SEC_IN_HOUR, function() {
    var hospital_key;
    $.ajax({
      url: "/hospital.php",
      async: false,
      success: function(data) {
        // Fetch the key from any uri containing the key param in the page
        var uri = URI($(data).find("a[href*=key]:first")[0].href);
        hospital_key = uri.query(true).key;
      },
    });
    return hospital_key;
  });
}

/**
 * Heals the player fully via hospital/sanctuary
 */
function fullHeal() {
  var uri = URI("/hospital.php")
    .query({ m: 1, key: getHospitalKey() });
  $.get(uri.href());
}

/**
 * FEATURE: Adds tooltip hovercards to player items.
 */
registerFunction(function addItemHovercards() {
  $('a[href*="javascript:modelesswin"]').each(function() {
    var equipData;
    $(this)
      .mouseover(function() {
        if (!equipData) {
          $.ajax({
            url: $(this).attr('href').match(/'(.*)'/).pop(),
            async: false,
            success: function(data) {
              equipData = $('center', data).html();
            }
          });
        }
        ddrivetip(equipData, 450);
      })
      .mouseout(hideddrivetip);
  });
}, [ "profile.php", "market2.php", "market3.php", "market6.php" ]);

/**
 * FEATURE: Adds an exclamation icon next to the fighting tab if the special
 * NPC hunt timer is up.
 */
registerFunction(function addSpecialHuntNotification() {
  var next_hunt_time = getNextSpecialHuntTime();
  if (Date.now() >= next_hunt_time) {
    var fighting_tab = $('img[alt="Fighting"]');
    var exclamation;
    exclamation = fontAwesomeIcon('fa-exclamation-circle').css({
      'float': 'left',
      'left': '8px',
      'position': 'relative',
      'top': '5px',
    });
    fighting_tab.after(exclamation);

    var hunting_link = $(':contains("NPC Hunting"):last');
    exclamation = fontAwesomeIcon('fa-exclamation-circle').css({
      'float': 'right',
      'position': 'relative',
      'right': '3px',
    });
    hunting_link.append(exclamation);
  }
}, [ ".*" ]);

/**
 * Fetches the earliest time (unixtime, in ms) one can hunt a special NPC.
 * Note that this is only going to be accurate to about the smallest time unit
 * present on the hunting page.
 */
function getNextSpecialHuntTime() {
  function computeNextSpecialHuntTime(data) {
    // Check to see if player is capable of hunting special characters in
    // the first place. If not, return a time far in the future.
    if (!$('font:contains("Special Character Hunting")', data).length) {
      return Number.MAX_VALUE;
    }

    var next_hunt_str = $('font:contains("can hunt again")', data).text();
    var days = next_hunt_str.match(/(\d+) day/);
    if (days) { days = parseInt(days[1]); }
    var hours = next_hunt_str.match(/(\d+) hour/);
    if (hours) { hours = parseInt(hours[1]); }
    var minutes = next_hunt_str.match(/(\d+) minute/);
    if (minutes) { minutes = parseInt(minutes[1]); }
    var seconds = next_hunt_str.match(/(\d+) second/);
    if (seconds) { seconds = parseInt(seconds[1]); }

    var sec_until_hunt =
      (days * SEC_IN_DAY) +
      (hours * SEC_IN_HOUR) +
      (minutes * SEC_IN_MINUTE) +
      seconds;
    var next_hunt_time = sec_until_hunt * MS_IN_SEC + Date.now();
    return next_hunt_time;
  }

  var next_hunt_time = cachedFetchWithRefresh(
    "hunting:specialhunttime",
    6 * SEC_IN_HOUR,
    "/hunting.php",
    computeNextSpecialHuntTime
  );

  return next_hunt_time;
}

// =============================================================================
//                                Profiles
// =============================================================================
/**
 * Various profile page tweaks.
 */
registerFunction(function setUpProfile() {
  // FEATURE: Format exp counts to include commas.
  $('img[title*="Exp :"]').each(function(){
    $(this)
      .attr('title',$(this).attr('title').replace(/\B(?=(\d{3})+(?!\d))/g, ","))
      .attr('alt',$(this).attr('title'));
  });
}, [ "profile.php" ]);

// =============================================================================
//                                Messages
// =============================================================================
/**
 * FEATURE: Adds confirmation dialog when deleting messages.
 */
registerFunction(function addDeleteMessageConfirm() {
  $('a[href*="messages4.php"]').each(function() {
    $(this).click(function() {
      return confirm("Delete Mail?");
    });
  });

  // For the checkbox delete link, override the onclick event handler with the
  // confirm dialog.
  $('a[onclick*="submitchecks(\'delete\');"]').each(function() {
    var clickhandler = $(this)[0].onclick;
    $(this).attr("onclick", "return false;");

    $(this).click(function() {
      if (confirm("Delete Mail?")) {
        return clickhandler();
      }
    });
  });
}, [ "messages.php" ]);


// =============================================================================
//                                  Market
// =============================================================================
registerFunction(function setUpStand() {
  // FEATURE: When selecting items from your inventory, if you already have that
  // item in your stand, copy over the price/currency for it.
  var item_selector = $('select[name="item"]');
  item_selector.change(function () {
    var selected_item = $.trim($(this).find("option:selected").text());
    var price_text = $("font.darktext > font:contains('"+selected_item+"')")
      .closest('tbody')
      .find("font:contains('each')");
    var num, currency;
    if (price_text.size()) {
      price_text = $.trim(price_text.first().text());
      var match = price_text.match(/(\d+)([cp]) each/);
      num = match[1];
      currency = match[2];
    } else {
      num = null;
      currency = 'c';
    }
    $('input[name="price"]').val(num);
    $('input[select="currency"]').val(currency === 'c' ? 1 : 2);
  });

  // FEATURE: Automatically select by default the first non-null item.
  var map = selectToMap(item_selector);
  $.each(map, function(key, value){
    if ($.trim(value) !== "None") {
      item_selector.val(key).change();
      return false;
    }
  });

  // FEATURE: Auto-check add all items with the same price by default.
  $('input[name="multi"]').prop('checked', true);

  // FEATURE: Bind 'a' to 'add item' button.
  Mousetrap.bind('a', _.once(function() {
    var add_btn = $('input[value="Add Item"]');
    add_btn.click();
  }));
}, [ "market3.php" ]);

/**
 * Transforms a select tag object to a [value => text] map
 */
function selectToMap(select) {
  var map = {};
  select.children().each(function() {
    map[this.value] = this.innerHTML;
  });
  return map;
}

// =============================================================================
//                                Abilities
// =============================================================================
/**
 * FEATURE: Removes completed abilities from the training selection options.
 */
registerFunction(function trimAbilityList() {
  $('option').each(function() {
    // Check trained level out of total. If they're equal, remove the option.
    var match = $(this).text().match(/\d/g);
    if (match && match.length === 2) {
      if (match[0] === match[1]) {
        $(this).remove();
      }
    }
  });
}, [ "information2.php" ]);


// =============================================================================
//                               Top 10 Lists
// =============================================================================
/**
 * FEATURE: Adds links to easily-copyable weekly top 10 data.
 */
registerFunction(function addOverallTop10ExportButtons() {
  addTop10ExportButton("Highest Levels");
  addTop10ExportButton("Highest Wins");
  addTop10ExportButton("Highest Losses");
  addTop10ExportButton("Achievements Score");
}, [ "highrecords.php" ]);

/**
 * FEATURE: Adds links to easily-copyable weekly top 10 data.
 */
registerFunction(function addWeeklyTop10ExportButtons() {
  addTop10ExportButton("Most Exp Earned");
  addTop10ExportButton("Most Wins");
  addTop10ExportButton("Most Losses");
  addTop10ExportButton("Most Hunting Points");
  addTop10ExportButton("Most Warfare Points");
  addTop10ExportButton("Most Tokens Earned");
}, [ "weekrecords.php" ]);

/**
 * FEATURE: Adds links to easily-copyable gang top 10 data.
 */
registerFunction(function addGangTop10ExportButtons() {
  addTop10ExportButton("Gang List : Highest Levels");
  addTop10ExportButton("Gang List : Last Week\'s Warfare Points");
}, [ "gangs2_4.php" ]);

/**
 * Given a table title, adds a button/link to copyable top 10 data.
 */
function addTop10ExportButton(table_title) {
  // Read the scores from the document and parse them
  var table = $('table:contains("' + table_title + '")');
  var players = table
    .find('a[href*="profile.php"]')
    .map(function (k, v) { return $(v).text(); });
  var scores = table
    .find('font.colortext')[0]
    .innerHTML.split('<br>');

  // Generate the text to be exported
  var export_text = "";
  for (var i = 0; i < 10; i++) {
    export_text = export_text + (i+1) + ';' + players[i] + ';' + scores[i] + '\n';
  }
  export_text = encodeURIComponent(export_text);
  var data = 'data:text,' + export_text;

  // Add icon-link to document with exported text
  var link = $("<a style='position: relative; right: 5px; float: right;''>");
  link.attr('href', data);
  link.append(fontAwesomeIcon('fa-file-text'));
  var title = $('font:contains("' + table_title + '")');
  title.after(link);
}


// =============================================================================
//                                 Combat
// =============================================================================
/**
 * FEATURE: Make attack buttons clickable once (prevents multi-attack errors).
 * For those of us who like frantically mashing 'attack' and think it's absurd
 * to hit the 'multi-attack' error page as a result.
 */
registerFunction(function preventMultiAttack() {
  // We simply disable the button after clicking on it once. I don't know which
  // buttons can cause multi-attack errors, so to be safe I fixed all attack
  // buttons I could find.
  /* jshint multistr:true */
  var atk_btn = $('input[value="Attack"],\
                   input[value="Attack Target"],\
                   input[value="Attack Again"],\
                   input[value="Hunt Again"]');
  atk_btn.each(function() {
    var btn = $(this);
    var disable_btn = function() { btn.prop('disabled', 'disabled'); };

    // Handle form submission vs button onclick differently, since for forms we
    // want to disable button on submit (post-submission), whereas for buttons
    // we want to disable it on click (after the native onclick handler fires)
    switch ($(this).prop('type')) {
      case 'submit':
        $('form').submit(disable_btn);
        break;
      case 'button':
        btn.click(disable_btn);
        break;
    }
  });
}, [ "fight\\d*.php", "hunting\\d*.php", "map2.php" ]);

// =============================================================================
//                               Wasteland
// =============================================================================
/**
 * FEATURE: Adds mouse tooltip showing coordinates to wl map.
 */
registerFunction(function wlMapCoOrds() {
  var coords = $('<div><div style="text-align:center;">1,1</div></div>');
  $('#overlay2')
    .mousemove(function(e) {
      // Firefox doesn't implement offsetX/Y, so compute it ourselves if needed.
      var offX  = (e.offsetX || e.clientX - $(e.target).offset().left + window.pageXOffset);
      var offY  = (e.offsetY || e.clientY - $(e.target).offset().top  + window.pageYOffset);
      var x = Math.ceil(offX / 33);
      var y = Math.ceil(offY / 33);
      coords.children().text(x + ',' + y);
      ddrivetip(coords.html(), 35);
    })
    .mouseout(hideddrivetip);
}, [ 'map.php' ]);

// =============================================================================
//                               Platinum Store
// =============================================================================
/**
 * FEATURE: Formats remaining boost time to a saner format.
 */
registerFunction(function formatRemainingBoostTime() {
  function formatTime(hours) {
    hours = parseInt(hours, 10);
    var out = [];
    switch (true) {
      case (hours >= 8736):
        var years = Math.floor(hours / (8736));
        out.push(years + " year" + (years > 1 ? "s" : ""));
        hours = hours % (8736);
        /* falls through */
      case (hours >= 168):
        var weeks = Math.floor(hours / (168));
        out.push(weeks + " week" + (weeks > 1 ? "s" : ""));
        hours = hours % (168);
        /* falls through */
      case (hours >= 24):
        var days = Math.floor(hours / (24));
        out.push(days + " day" + (days > 1 ? "s" : ""));
        hours = hours % 24;
        /* falls through */
      case (hours > 0):
        out.push(hours + " hour" + (hours > 1 ? "s" : ""));
        /* falls through */
      default:
        var str = out.join(", ");
        return str;
    }
  }

  $('img[alt*=Boost][onmouseover]').each(function() {
    var regex = /\d{1,} hour\(s\)/;
    var time = $(this).attr('onmouseover').match(regex);
    if (time) {
      $(this).attr(
        'onmouseover',
        $(this).attr('onmouseover').replace(regex, formatTime(time))
      );
    }
  });
}, [ "platinum_store.php" ]);

// =============================================================================
//                                 Vote Page
// =============================================================================
/**
 * FEATURE: Adds an exclamation icon next to the community tab if the top list
 * vote timers are up.
 */
registerFunction(function addVoteNotification() {
  function getCanVote() {
    // Server time is EST (UTC -5). Vote timer resets at 0500 and 1700 UTC.
    // Thus, we set our cache timer to expire at around server reset.
    var date = new Date();
    var hrs_until_reset = 12 - mod(date.getUTCHours() + SERVER_UTC_OFFSET_HRS, 12);
    var sec_until_reset =
      (hrs_until_reset * SEC_IN_HOUR) -
      (date.getUTCMinutes() * SEC_IN_MINUTE) -
      (date.getUTCSeconds()) +
      5 * SEC_IN_MINUTE; // add a bit of a buffer just in case

    return cachedFetchWithRefresh(
      "voting:canvote",
      sec_until_reset,
      "/voting.php",
      function(data) { return $('b:contains("Not Voted")', data).length > 0; }
    );
  }

  if (getCanVote()) {
    var community_tab = $('img[alt="Community"]');
    var exclamation;
    exclamation = fontAwesomeIcon('fa-exclamation-circle').css({
      'float': 'left',
      'left': '5px',
      'position': 'relative',
      'top': '5px',
    });
    community_tab.after(exclamation);

    var vote_link = $(':contains("Vote for Legacy"):last');
    exclamation = fontAwesomeIcon('fa-exclamation-circle').css({
      'float': 'right',
      'position': 'relative',
      'right': '3px',
    });
    vote_link.append(exclamation);
  }
}, [ '.*' ]);

// =============================================================================
//                                 Constants
// =============================================================================
var MS_IN_SEC = 1000;
var SEC_IN_MINUTE = 60;
var SEC_IN_HOUR = 60 * SEC_IN_MINUTE;
var SEC_IN_DAY = 24 * SEC_IN_HOUR;

// Legacy server runs on EST (UTC-5)
var SERVER_UTC_OFFSET_HRS = -5;

// =============================================================================
//                                 Utilities
// =============================================================================
/**
 * Adds caching to a function. Fetches from cache if value is there, otherwise
 * generates, stores in cache, and returns results of fetch_fn.
 */
function cachedFetch(key, timeout, fetch_fn) {
  var value = cacheGet(key);
  if (value === null) {
    value = fetch_fn();
    cacheSet(key, value, timeout);
  }
  return value;
}

function cacheSet(key, value, timeout) {
  locache.set(sessionKey(key), value, timeout);
}

function cacheGet(key) {
  return locache.get(sessionKey(key));
}

/**
 * Fetching/caching function. Fetches key from cache if available, otherwise
 * does an ajax get to url and applies fn to compute return value. If already
 * at url, applies fn, and stores result in cache.
 */
function cachedFetchWithRefresh(key, timeout, path, fn) {
  var value;
  if (window.location.pathname === path) {
    value = fn(document);
    cacheSet(key, value, timeout);
  } else {
    value = cachedFetch(key, timeout, function() {
      var ret;
      $.ajax({
        url: path,
        async: false,
        success: function(data) { ret = fn(data); },
      });
      return ret;
    });
  }
  return value;
}

/**
 * Transforms a key such that it is only valid for the current session. Should
 * be used for all cache keys.
 */
function sessionKey(key) {
  var legacy_hash;
  switch (URI(window.location.href).subdomain()) {
    case 'www':
      legacy_hash = document.cookie.match(/legacy_hash=(\w+)/)[1];
      break;
    case 'dev':
      legacy_hash = document.cookie.match(/legacy_hash_dev=(\w+)/)[1];
      break;
  }
  return key + ":" + legacy_hash;
}

/**
 * Returns a font awesome icon. Loads required CSS to page if necessary.
 */
function fontAwesomeIcon(klass) {
  // Load CSS stylesheet if not loaded yet.
  if (!$('link[href*="font-awesome.min.css"]').length) {
    $('head').append(
      $('<link href="//maxcdn.bootstrapcdn.com/font-awesome/4.1.0/css/font-awesome.min.css" rel="stylesheet">')
    );
  }
  return $('<i class="fa ' + klass + '"></i>');
}

function mod(n, m) {
  return ((n % m) + m) % m;
}

// ====================================== END ==================================
