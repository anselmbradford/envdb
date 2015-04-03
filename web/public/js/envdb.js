var Envdb = {
  table: false,
  fixedTable: false,

  Node: {
    current: null,
    tables: [],

    fetchTables: function(callback) {
      var self = this;

      Envdb.Socket.request('tables', {
        id: self.current
      }, function(err, data) {

        self.tables = data;

        if (typeof callback === "function") {
          return callback(data, err);
        }
      });
    },

    fetchTableInfo: function(table, callback) {
      var self = this;

      if (Envdb.fixedTable) {
        Envdb.fixedTable._fnDestroy();
        Envdb.fixedTable = false;
      }

      if (Envdb.table) {
        Envdb.table.destroy();
        Envdb.table = false;
      }

      Envdb.Loading.start();

      Envdb.Socket.request('table-info', {
        id: self.current,
        sql: "pragma table_info(" + table + ");",
      }, function(err, data) {

        if (typeof callback === "function") {
          data.hideNode = true;
          Envdb.Query.Render([data], err, function() {
            return callback(data, err);
          });
        }

      });
    },

    clean: function() {
      this.current = null; 
      this.tables = [];

      if (Envdb.fixedTable) {
        Envdb.fixedTable._fnDestroy();
        Envdb.fixedTable = false;
      }

      if (Envdb.table) {
        Envdb.table.destroy();
        $(".query-results").remove();
        Envdb.table = false;
      }

      $("#content").removeClass("node-view");
      $("#node-tables").remove();
    },

    close: function() {
      this.clean();
      $("#header .title").text("Query All Nodes");
    },

    open: function(name, id) {
      var self = this;

      this.clean();
      this.current = id;

      Envdb.Loading.start();
      this.fetchTables(function(data, err) {
        Envdb.Loading.done();

        $("#header .title").text("Query Node: " + data.name + " ("+data.hostname+")");
        $("#content").addClass("node-view");
        $("#wrapper").append(Envdb.Templates.tables(data.results));

        $("ul.tables li").on("click", function(e) {
          e.preventDefault();

          $("ul.tables li").removeClass("selected");
          $(this).addClass("selected");

          var table = $(this).attr("data-table-name");
          self.fetchTableInfo(table, function() {
          })
        });

        $("ul.tables li:first-child").click();
      });

    }
  },

  Flash: {
    delay: 1500,

    show: function(data, type) {
      var self = this;

      if (self.timeout) {
        clearTimeout(self.timeout);
        self.timeout = null
        self.hide();
      }

      self.hide();

      $("#flash-message").attr("class", type).text(data).show();

      self.timeout = setTimeout(function() {
        $("#flash-message").stop().fadeOut("slow", function() {
          self.hide();
        });
      }, this.delay);
    },
    hide: function() {
      $("#flash-message").attr("class", "").text("").hide();
    },
    error: function(message) {
      this.show(message, "error");
    },
    success: function(message) {
      this.show(message, "success");
    }
  },

  Loading: {
    options: {
      ajax: true,
      document: true,
      eventLag: true
    },
    start: function() {
      this.self = Pace.start(this.options);
      $("#envdb-query, #content").css("opacity", 0.5);
      // $("#loading").show();
    },
    stop: function() {
      Pace.stop();
      $("#envdb-query, #content").css("opacity", 1);
      // $("#loading").hide();
    },
    restart: function() {
      Pace.restart();
    },
    done: function() {
      Pace.stop();
      $("#envdb-query, #content").css("opacity", 1);
      // $("#loading").hide();
    }
  },

  Templates: {

    Init: function() {
      this.table = Handlebars.compile($("#query-results-table").html());
      this.row = Handlebars.compile($("#query-results-row").html());
      this.agent = Handlebars.compile($("#agent-template").html());
      this.tables = Handlebars.compile($("#tables-template").html());
    }

  },

  Query: {
    Execute: function() {
      $("#content").scrollTop(0);

      if (Envdb.fixedTable) {
        Envdb.fixedTable._fnDestroy();
        Envdb.fixedTable = false;
      }

      if (Envdb.table) {
        Envdb.table.destroy();
        Envdb.table = false;
      }

      var value = Envdb.Editor.self.getValue();

      Envdb.Loading.start()

      Envdb.Query.Run("query", value.replace(/(\r\n|\n|\r)/gm, " "), function(results, err) {
        Envdb.Query.Render(results, err);
      });

    },

    Render: function(results, err, callback) {
      if (results && results.length > 0) {
        if (results[0].error.length > 0) {
          var er = results[0].error;
          if (er === "exit status 1") {
            Envdb.Flash.error("Query Syntax Error - Check your query and try again.");
          } else {
            Envdb.Flash.error("Query Error: " + er);
          }
          Envdb.Editor.self.focus();
          Envdb.Loading.done()
          return;
        }
      } else {
        Envdb.Flash.error("Notice: Your query returned no data.")

        Envdb.Editor.self.focus();
        Envdb.Loading.done()
      }

      var table = null;

      if (results && results.length > 0) {

        for (record in results) {

          var agent = results[record];

          agent.results = JSON.parse(agent.results)

          if (!table) {
            var data = {
              hideNode: agent.hideNode || false,
              name: agent.name,
              hostname: agent.hostname,
              results: agent.results[0]
            }
            table = Envdb.Templates.table(data);
            $("#content .wrapper").html(table);
          }

          var data = {
            hideNode: agent.hideNode || false,
            name: agent.name,
            hostname: agent.hostname,
            results: agent.results
          }
          var row = Envdb.Templates.row(data)
          $("table.query-results tbody").append(row);

        }

        Envdb.table = $("table.query-results")
        .on('order.dt', function() {
          if (Envdb.fixedTable) {
            Envdb.fixedTable.fnUpdate()
            $("#content").scrollTop(0);
          }
        }).DataTable({
          searching: false,
          paging: false,
          info: false
        });

        Envdb.fixedTable = new $.fn.dataTable.FixedHeader(Envdb.table, {
        });

        window.onresize = function() {
          if (Envdb.fixedTable) {
            Envdb.fixedTable.fnUpdate()
          }
        }

        if (typeof callback === "function") {
          callback(results, err);
        }

      } else {
        Envdb.Flash.error("Your query returned no data.")
        // error - no data
      }

      // $("table.query-results").tablesorter();

      Envdb.Editor.self.focus();
      Envdb.Loading.done()
    },

    Run: function(type, sql, callback) {

      var id = "all";

      if (Envdb.Node.current) {
        id = Envdb.Node.current;
      }

      Envdb.Socket.request(type, {
        id: id,
        sql: sql,
      }, function(err, data) {

          if (typeof callback === "function") {
            return callback(data, err);
          }

        });
    }
  },

  Editor: {
    self: null,

    Build: function() {
      ace.require("ace/ext/language_tools");

      this.self = ace.edit("editor");

      this.self.setOptions({
        enableBasicAutocompletion: true,
        enableSnippets: true,
        enableLiveAutocompletion: true
      });

      this.self.getSession().setMode("ace/mode/sql");

      this.self.getSession().setTabSize(2);
      this.self.getSession().setUseSoftTabs(true);
      this.self.getSession().setUseWrapMode(true);
      this.self.setValue("select * from listening_ports a join processes b on a.pid = b.pid;");

      this.self.focus();
      this.self.setHighlightActiveLine(false);
      this.self.setShowPrintMargin(true);

      // document.getElementById('editor').style.fontSize='13px';

      this.self.commands.addCommands([
        {
          name: "run_query",
          bindKey: {
            win: "Ctrl-Enter",
            mac: "Command-Enter"
          },
          exec: function(editor) {
            Envdb.Query.Execute();
          }
        }
      ]);

      $("a.run-query").on("click", function(e) {
        e.preventDefault();
        Envdb.Query.Execute();
      });

      $("a.export-results").on("click", function(e) {
        e.preventDefault();
        var csv = $("table.query-results").table2CSV({
          delivery: 'value'
        });
        window.location.href = 'data:text/csv;charset=UTF-8,' 
        + encodeURIComponent(csv);
      });
    }
  },

  Socket: null,
  Init: function() {

    gotalk.handleNotification('agent-update', function(agent) {
      var item = $("li[data-agent-id='" + agent.id + "']");
      if (item.length > 0) {
        item.replaceWith(Envdb.Templates.agent(agent))
      } else {
        $("ul#agents").append(Envdb.Templates.agent(agent))
      }
    });

    Envdb.Socket = gotalk.connection().on('open', function() {});

    Envdb.Templates.Init()
    Envdb.Editor.Build()
  }
};

jQuery(document).ready(function($) {

  Envdb.Init();

  var lastScrollLeft = 0;
  $("#content").on("scroll", function() {
    if (Envdb.fixedTable) {
      var documentScrollLeft = $("#content").scrollLeft();
      if (lastScrollLeft != documentScrollLeft) {
        // super hack
        Envdb.fixedTable.fnPosition();
        $(".FixedHeader_Cloned").css("top", 230);
        lastScrollLeft = documentScrollLeft;
      }
    }
  });

  $(document).on("click", "li.agent", function(e) {
    e.preventDefault();

    var name = $(this).find("span.agent-name").text();
    var id = $(this).attr("data-agent-id");
  

    if ($(this).hasClass("online")) {
      if ($(this).hasClass("current")) {
        $("li.agent").removeClass("current");
        Envdb.Node.close();
      } else {
        Envdb.Node.open(name, id);
        $("li.agent").removeClass("current");
        $(this).addClass("current");
      }

    } else {
      Envdb.Flash.error("Node ("+name+") is current offline.");
    }
  });


  var agentList = new List('sidebar', {
    valueNames: ['agent-name', 'agent-agent-id']
  });

});
