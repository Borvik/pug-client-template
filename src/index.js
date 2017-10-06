'use strict';

const pug = require('pug');
const pugRuntimeSources = require('pug-runtime/lib/sources');
const codeGen = require('pug-code-gen');

// stores template functions for the current run
let templateCache = {},
    compileOptions = null,
    compile_level = 0,
    outputServerHelpers = true;

class PugClientTemplate {

  static init() {
    let self = new PugClientTemplate();
    return (req, res, next) => {
      self.register(res);
      next();
    };
  }

  register(res) {
    let self = this;

    if (typeof res.locals.plugins !== 'undefined' && !Array.isArray(res.locals.plugins)) {
      throw new Error('res.locals.plugins is already in use - perhaps by a different node module');
    }

    if (typeof res.locals.plugins === 'undefined') {
      res.locals.plugins = [];
    }

    res.locals.plugins.push({
      lex: { include: self.handleLexClientTemplate },
      parse: {
        expressionTokens: {
          "pugtemplate": function(parser) { return self.parseClientTemplate(parser); },
          "pugruntime": function(parser) { return self.parsePugRuntime(parser); }
        }
      },
      postCodeGen: function(js) {
        return js;
      }
    });
  }

  handleLexClientTemplate(lexer) {
    let token = lexer.scan(/^pugtemplate(?=\(| |$|\n)/, 'pugtemplate');
    if (token) {
      lexer.tokens.push(token);
      lexer.callLexerFunction('attrs');
      lexer.interpolationAllowed = false;
      lexer.callLexerFunction('pipelessText');
      return true;
    }

    token = lexer.scan(/^pugruntime(?=\(| |$|\n)/, 'pugruntime');
    if (token) lexer.tokens.push(token);
  }

  parsePugRuntime(parser) {
    let tok = parser.expect('pugruntime');
    
    let runtime = '(function(){window.pug={};';
    let propNames = Object.getOwnPropertyNames(pugRuntimeSources);
    propNames.sort().forEach(name => {
      if (name === 'rethrow') return;
      runtime += pugRuntimeSources[name];
      runtime += 'window.pug.' + name + '=' + 'pug_' + name + ';';
    });

    //output all template functions
    let objectsOutput = [];
    for (let fnName in templateCache) {
      if (!templateCache.hasOwnProperty(fnName)) continue;
      let fn = templateCache[fnName];
      if (objectsOutput.indexOf(fn.obj) < 0) {
        objectsOutput.push(fn.obj);
        runtime += 'window.' + fn.obj + '={};';
      }
      runtime += 'window.' + fn.obj + '.' + fnName + '=' + fn.fn + ';';
    }

    runtime += '})();';
    
    return {
      type: 'Tag',
      name: 'script',
      selfClosing: false,
      block: {
        type: 'Block',
        nodes: [{
          type: 'Text',
          val: runtime,
          line: tok.line,
          column: tok.col,
          filename: parser.filename
        }],
        line: tok.line,
        filename: parser.filename
      },
      attrs: [],
      attributeBlocks: [],
      isInline: false,
      line: tok.line,
      filename: parser.filename
    };
  }

  parseClientTemplate(parser) {
    let tok = parser.expect('pugtemplate');
    let block, attrs = [];

    if (parser.peek().type === 'start-attributes') {
      attrs = parser.attrs();
    }

    let nameAttr = attrs.find(attr => attr.name === 'name');
    let objAttr = attrs.find(attr => attr.name === 'obj');
    let dataAttr = attrs.find(attr => attr.name === 'data');
    if (!nameAttr) {
      parser.error('INVALID_TOKEN', 'Missing "name" attribute on pugtemplate', tok);
    }
    if (!objAttr) {
      objAttr = {val: "'templates'"};
    }
    
    let objectName = objAttr.val.substring(1, objAttr.val.length - 1);
    let templateName = nameAttr.val.substring(1, nameAttr.val.length - 1);

    if (templateName && dataAttr) {
      if (!templateCache.hasOwnProperty(templateName))
        parser.error('INVALID_TOKEN', 'PugTemplate "' + templateName + '" has not been defined', tok);
        
      return {
        type: 'Text',
        pugtemplate: true,
        func: templateName,
        data: dataAttr.val,
        line: tok.line,
        column: tok.col,
        filename: parser.filename
      };
    }

    if (templateCache.hasOwnProperty(templateName)) {
      parser.error('INVALID_TOKEN', 'PugTemplate "' + templateName + '" has already been defined', tok);
    }

    block = parser.parseTextBlock() || parser.emptyBlock(tok.line);
    let templateText = block.nodes.map(function(node) { return node.val; }).join('');
    
    let fnBody = pug.compileClient(templateText, {
      compileDebug: false,
      inlineRuntimeFunctions: false,
      name: templateName,
      filename: parser.filename,
      pretty: compileOptions.pretty,
      globals: compileOptions.globals,
      self: compileOptions.self,
      filters: compileOptions.filters,
      filterOptions: compileOptions.filterOptions,
      filterAliases: compileOptions.filterAliases,
      plugins: compileOptions.plugins
    });

    templateCache[templateName] = {fn: fnBody, obj: objectName, server: false};
    
    return {
      type: 'Text',
      pugtemplate: false,
      line: tok.line,
      column: tok.col,
      filename: parser.filename
    };
    // return {
    //   type: 'Tag',
    //   name: 'script',
    //   selfClosing: false,
    //   block: {
    //     type: 'Block',
    //     nodes: [{
    //       type: 'Text',
    //       val: templateFunction,
    //       line: tok.line,
    //       column: tok.col,
    //       filename: parser.filename
    //     }],
    //     line: tok.line,
    //     filename: parser.filename
    //   },
    //   attrs: [],
    //   attributeBlocks: [],
    //   isInline: false,
    //   line: tok.line,
    //   filename: parser.filename
    // };
  }
}

let pug_compile = pug.compile;
pug.compile = function(str, options) {
  if (!compile_level) compileOptions = options || {};
  compile_level++;

  let err = null, result = null;

  try {
    result = pug_compile.call(pug, str, options);
  } catch(error) {
    err = error;
  }

  compile_level--;
  if (!compile_level) {
    compileOptions = null;
    templateCache = {};
  }

  if (err) throw err;
  return result;
};

let pug_compileClientWithDependenciesTracked = pug.compileClientWithDependenciesTracked;
pug.compileClientWithDependenciesTracked = function(str, options) {
  if (!compile_level) compileOptions = options || {};
  compile_level++;

  let err = null, result = null;

  try {
    result = pug_compileClientWithDependenciesTracked(str, options);
  } catch (error) {
    err = error;
  }

  compile_level--;
  if (!compile_level) {
    compileOptions = null;
    templateCache = {};
  }

  if (err) throw err;
  return result;
};


let origVisit = codeGen.CodeGenerator.prototype.visit;
codeGen.CodeGenerator.prototype.visit = function(node, parent) {
  if (node && node.type && node.type !== 'Block' && compile_level === 1 && outputServerHelpers) {
    console.log('VISIT ON SERVER');
    outputServerHelpers = false;
    
    let js = ';var pug_pct_tmpl={}';
    for (let fnName in templateCache) {
      if (!templateCache.hasOwnProperty(fnName)) continue;
      js += ';pug_pct_tmpl.' + fnName + '=' + templateCache[fnName].fn;
      templateCache[fnName].server = true;
    }
    if (js !== ';var pug_pct_tmpl={}')
      this.buf.push(js + ';');
  }
  origVisit.call(this, node, parent);
};

let origVisitText = codeGen.CodeGenerator.prototype.visitText;
codeGen.CodeGenerator.prototype.visitText = function(node) {
  if (!node.hasOwnProperty('pugtemplate')) {
    origVisitText.call(this, node);
    return;
  }
  if (node.pugtemplate === false) return;

  let func = templateCache[node.func];
  if (!func.server) {
    // generate function
  }
  console.log(node.func + ' generated for SERVER');
  //let exp = '(function(argData) {' + func.fn + ';return ' + node.func + '(argData);})' + '(' + node.data + ')';
  //let exp = 'pug.pct_tmpl.' + node.func + '(' + node.data + ')';
  let exp = '(function(argData){return pug_pct_tmpl.'+node.func+'(argData);})(' + node.data + ')';
  this.bufferExpression(exp);
};

module.exports = PugClientTemplate.init();