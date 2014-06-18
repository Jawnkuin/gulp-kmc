'use strict';
var through = require('through'),
    gutil = require('gulp-util'),
    PluginError = gutil.PluginError,
    fs = require('fs'),
    path = require('path'),
    minimatch = require("minimatch"),
    gulp = require("gulp"),
	kmd = require("kmd");

var pathSeparatorRe = /[\/\\]/g;

var depMap = {},
    realDepMap = {},
    options = {},
    writeTimer = null;


function endsWith(str, suffix) {
    var ind = str.length - suffix.length;
    return ind >= 0 && str.indexOf(suffix, ind) === ind;
}

function parseExt(ext) {
    var _ext = {};

    if(!ext) {
        _ext = kmd.config("ext") || {
            min:"-min.js",
            src:".js"
        };
    }else if(typeof ext == "string") {
        _ext = {
            min:ext,
            src:".js"
        }
    }else {
        _ext = {
            min:ext.min||"-min.js",
            src:ext.src||".js"
        }
    }
    return _ext;
}


function writeDepFile(filePath){
    var depFilePath = kmd.config("depFilePath");

    if(depFilePath){
        filePath = depFilePath;
    }
    if(!fs.existsSync(path.dirname(filePath))) {
        fs.mkdirSync(path.dirname(filePath));
    }
    var code ="/*generated by KMD*/\nKISSY.config('modules'," + JSON.stringify(depMap,null,4) +');'
    fs.writeFileSync(filePath,code);
    fs.writeFileSync(filePath.replace(/\.js$/,"-min.js"),kmd.minify(code));
    gutil.log(gutil.colors.green('[ok]')+'combined dependency file ' + gutil.colors.green(filePath) + ' is created.');
}

module.exports ={
    config: kmd.config,
    convert: function(opt) {
        var buffer = [],
            ext = parseExt(opt.ext);


        options["cmd2k"] =opt||{};

	    function k2cmd(file) {
            /*jshint validthis:true */
            if (file.isNull()) {
                return;
            }

            if (file.isStream()) {
                return this.emit('error', new PluginError('gulp-kmc',  'Streaming not supported'));
            }

            var ignore = false;

            if(opt.exclude) {
                ignore = opt.exclude.some(function(item) {
                    return path.dirname(file.path).split(pathSeparatorRe).some(function(pathName) {
                        return minimatch(pathName, item);
                    });
                });
            }

            if(!ignore && opt.ignoreFiles) {
                ignore = opt.ignoreFiles.some(function(item) {
                    return minimatch(path.basename(file.path), item);
                });
            }

            if(ignore) {
                buffer.push(file);
                return;
            }

            file.realPath = file.path;
            var r = kmd.convert(file.contents.toString(), {
                                            filePath:file.path,
                                            fixModuleName:opt.fixModuleName || kmd.config("fixModuleName")
                                        });


            if(r.dependencies.length && !depMap[r.moduleInfo.moduleName]) {
                var requires = [],realRequires = [];
                r.dependencies.forEach(function(dep) {
                    requires.push(dep);
                    realRequires.push(dep);
                });
                realDepMap[r.moduleInfo.moduleName] = { requires: realRequires };
                depMap[r.moduleInfo.moduleName] = { requires: requires };
            }

            if(opt.minify) {
                var new_path = file.path.replace(/\.js$/, ext.min),
                    new_file = new gutil.File({
                                   contents:new Buffer(r.minify),
                                   path:new_path,
                                   base:file.base
                               });
                new_file.moduleInfo = r.moduleInfo;
                new_file.before_path = file.path;
                buffer.push(new_file);

            }

            file.path = file.path.replace(/\.js$/,ext.src);
            file.contents = new Buffer(r.source);
            file.before_path = file.path;
            file.before_base = file.base;
            file.moduleInfo = r.moduleInfo;
            buffer.push(file);

        }

        function endStream() {
            if (buffer.length === 0) return this.emit('end');
            var self = this;

            buffer.forEach(function(file){
               //console.log(file.path)
               self.push(file);
               //console.log(file.path);
               //self.push(file);
            });

            if(opt.depFilePath) {
                writeDepFile(opt.depFilePath);
            }
            this.emit('end');

        }

	    return through(k2cmd, endStream);
    },
    combo: function(opt) {

       var combined = {},
           ext = parseExt(opt.ext),
           config = null;

       var buffer = [];

       options["combo"] =opt||{};

       function combo(_file, callback) {
            var combinedFile = [];

            if(combined[_file.path]) {
                return combinedFile;
            }

            if(opt && opt.files && opt.files.length) {
                opt.files.forEach(function(file){
                    if(path.resolve(file.src) == _file.path){
                       var info = kmd.combo(_file.path),
                           src = file.dest.replace(/\.js$/,ext.src),
                           dest = file.dest.replace(/\.js$/,ext.min);

                       var srcFile = new gutil.File({
                                        base:path.dirname(file.dest),
                                        path:src,
                                        contents: new Buffer(info.source.join("\n"))
                                    });
                       srcFile.moduleInfo = _file.moduleInfo;
                       srcFile.before_path = _file.before_path;
                       buffer.push(srcFile);

                       if(opt.minify) {
                            var minifyFile = new gutil.File({
                                                base:path.dirname(file.dest),
                                                path:dest,
                                                contents: new Buffer(info.minify.join(""))
                                             });
                            minifyFile.moduleInfo = _file.moduleInfo;
                            minifyFile.before_path = _file.before_path;
                            buffer.push(minifyFile);
                       }

                       gutil.log('combined  file ' + gutil.colors.green(file.dest) + ' is created.');

//                       "/*\ncombined files by KMD:\n" + modsName.join("\n")+"\n*/\n";
//                       combined[_file.path] = {
//                          files:[],
//                          contents:[],
//                          dest:file.dest
//                       };

                    }
                });
            }
       }

       function endStream() {
           if (buffer.length === 0) return this.emit('end');
           var self = this;

           var minifyFile = {};
           buffer.forEach(function(file){

               self.push(file);

               var base = file.base;
               if(file.moduleInfo==0) {
                   var pkg = file.moduleInfo.package;
                   //console.log(file.base+'\n'+ file.before_base+'\n'+file.path+'\n'+file.before_path);
                   //console.log(file.moduleInfo);
                   console.log(path.relative(pkg.base, file.before_path));
                   console.log(pkg.name);
                   if(!endsWith(file.base,pkg.name) || !endsWith(file.base,pkg.name+'/')) {
                        base = path.join(file.base,pkg.name);
                   }
                   console.log(file.base);

                   file.path = file.path.replace(file.base,base);
                   console.log(file.path);
                   console.log('****************************');
               }

               for(var f in combined){
                  var comboInfo = combined[f],
                      index = comboInfo.files.indexOf(file.realPath);

                  if(index > -1) {
                     comboInfo.contents.push(file.contents);
                     comboInfo.files.splice(index,1);
                  }
               }

           });

           this.emit('end');
       }

       return through(function (file) {

            if(!config) {
                kmd.config("modules",realDepMap);
                config = true;
            }
            if (file.isNull()) {
                this.push(file);
                return ;
            }

            if (file.isStream()) {
                return callback(uglifyError('Streaming not supported', {
                    fileName: file.path,
                    showStack: false
                }));
            }
            file.before_path = file.before_path || file.path;
            file.before_base = file.before_base|| file.base;
            combo(file);

            buffer.push(file);

        },endStream);
    },
    dest: function(outFolder, opt){

        return through(function(file){
            //buffer.push(file);
            var folder = null,
                base = path.basename(file.base);

            if(file.moduleInfo) {
                var pkg = file.moduleInfo.package;
                if(outFolder[pkg.name]) {
                    folder = outFolder[pkg.name];
                }else if(outFolder["*"]) {
                    folder = outFolder[pkg.name];
                }else {
                    folder = outFolder;
                }
            }else {
                folder = outFolder["*"] || outFolder;
            }
            if(!folder) {
                gutil.log(gutil.colors.green('[error]')+' file '+gutil.colors.red(file.path)+' does not have a valid out put folder! ');
                return;
            }
            gutil.log(gutil.colors.green('[ok]')+' file ' + gutil.colors.green(file.path) + ' is created.');
            gulp.dest.call(gulp, folder, opt).write(file);
        });
    }
}
