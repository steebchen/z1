#! /usr/bin/env node

const net = require('net')
const fs = require('fs')
const path = require('path')
const util = require('util')
const assert = require('assert')
const program = require('caporal')
const xTime = require('x-time')

const z1 = require('./../remote/index')
const pack = require('./../package.json')
const spam = require('./message')

const rString = /.+/

const SPACER = '--'

const argv = process.argv.slice()
let args = []
let count = argv.filter(item => item === SPACER).length
if((count && !argv.includes('completion')) || count > 1) {
  args = argv.splice(argv.indexOf(SPACER) + 1)
}

program
  .version(pack.version)
program
  .command('resurrect', 'start the apps that were started before exit')
  .action(() => {
    console.log('resurrecting')
    spam.start()
    return z1.resurrect().then(data => {
      spam.stop()
      console.log('resurrected')
      console.log('workers started:', data.started)
    }).catch(handle)
  })
program
  .command('start', 'start the app in the dir')
  .argument('[dir]', 'directory of the app')
  .option('--name <name>', 'name of your app', checkString)
  .option('--ports <ports>', 'ports that your app listens to', checkList)
  .option('--workers <workers>', 'count of workers (default: number of CPUs)', checkString)
  .option('--output <output>', 'directory for the log files of this app', checkDir)
  .option('--env <env>', 'environment variables e.g. NODE_ENV=development', checkString)
  .action((args, opts, logger) => {
    const dir = args.dir
    // prepare opts
    console.log('args:', args, 'opts:', opts)
    const opt = {
      name: opts.name,
      workers: opts.workers,
      ports: opts.ports
    }
    if(opts.output) {
      opt.output = path.resolve(opts.output)
    }

    // parse environment variables
    const env = {}
    if(opts.env) {
      opts.env.split(',').forEach(pair => {
        const parts = pair.split('=')
        env[parts[0]] = parts[1]
      })
    }

    console.log('starting app')
    spam.start()
    return z1.start(dir, args, opt, env).then(data => {
      spam.stop()
      console.log('started')
      console.log('name:', data.app)
      console.log('ports:', data.ports.join())
      console.log('workers started:', data.started)
    }).catch(handle)
  })
program
  .command('stop', 'stop the app specified by the appName')
  .argument('[appName]', 'app to stop')
  .complete(() => {
    return z1.list().then(data => {
      return Object.keys(data.stats)
    })
  })
  .option('-t, --timeout <timeout>', 'time until the workers get killed')
  .option('-s, --signal <signal>', 'kill signal')
  .action((appName = getAppName(), opts) => {
    const opt = {
      timeout: opts.timeout,
      signal: opts.signal
    }
    console.log(`stopping app "${appName}"`)
    spam.start()
    return z1.stop(appName, opt).then(data => {
      spam.stop()
      console.log('stopped')
      console.log('name:', data.app)
      console.log('workers killed:', data.killed)
    }).catch(handle)
  })
program
  .command('restart', 'restart the app specified by the appName')
  .argument('[appName]', 'app to restart')
  .complete(appName => {
    return z1.list().then(data => {
      return Object.keys(data.stats)
    })
  })
  .option('-t, --timeout <timeout>', 'time until the old workers get killed')
  .option('-s, --signal <signal>', 'kill signal for the old workers')
  .action((appName = getAppName(), opts) => {
    const opt = {
      timeout: opts.timeout,
      signal: opts.signal
    }
    console.log(`restarting app "${appName}"`)
    spam.start()
    return z1.restart(appName, opt).then(data => {
      spam.stop()
      console.log('restarted')
      console.log('name:', data.app)
      console.log('ports:', data.ports.join())
      console.log('workers started:', data.started)
      console.log('workers killed:', data.killed)
    }).catch(handle)
  })
program
  .command('list', 'overview of all running workers')
  .option('-m, --minimal', 'minimalistic list (easy to parse)')
  .action(opt => {
    return z1.list().then(data => {
      const props = Object.keys(data.stats)

      if(!props.length) {
        console.log('no workers running')
        return
      }

      if(opt.minimal) {
        console.log(props.join(' '))
        return
      }

      const max = process.stdout.columns
      const stuff = '                    '

      console.log(' workers name                 directory')
      for(const prop of props) {
        let obj = data.stats[prop]
        let p = (stuff + obj.pending).substr(-2)
        let a = (stuff + obj.available).substr(-2)
        let k = (stuff + obj.killed).substr(-2)
        let name = (prop + stuff).substr(0, 20)
        let dir = obj.dir.substr(0, max - 30)
        console.log(p, a, k, name, dir)
      }
      console.log(' |  |  |')
      console.log(' |  | killed')
      console.log(' | available')
      console.log('pending')

      if(data.isResurrectable) {
        console.log('\nThe listed apps are currently not running.\nType "z1 resurrect" to start them.')
      }
    }).catch(handle)
  })
program
  .command('exit', 'kill the z1 daemon')
  .action(() => {
    return z1.exit().then(data => {
      console.log('daemon stopped')
    }).catch(handle)
  })

program.parse(argv)

module.exports = program

function checkDir(dir) {
  fs.readdirSync(dir)
  return dir
}

function checkString(string) {
  assert(string)
  assert.strictEqual(typeof string, 'string')
  return string
}

function checkList(list) {
  list += ''
  checkString(list)
  const items = list.split(',').map(item => +item).filter(item => item)
  assert(items.length)
  return items
}

function getAppName() {
  console.log('no appName given')
  console.log('searching directory for package.json')
  try {
    const file = path.join(process.cwd(), 'package.json')
    const pack = require(file)
    assert(pack.name)
    console.log(`found name "${pack.name}" in package.json`)
    return pack.name
  } catch(err) {
    console.error(`no package.json file found`)
    handle(new Error('missing argument `appName\''))
  }
}

function handle(err) {
  if(process.env.NODE_ENV === 'development') {
    console.error(err)
  } else {
    console.error(`\n  error: ${err.message}\n`)
  }
  process.exit(1)
}
