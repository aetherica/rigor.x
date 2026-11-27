import test from "node:test";
import assert from "node:assert/strict";
import {parseRobots,decideRobots,robotsFetchStatusAllowed} from "./robots.ts";
test("longest match wins; allow wins ties",()=>{const r=parseRobots("User-agent: *\nDisallow: /private\nAllow: /private/public\nDisallow: /tmp*\n");assert.equal(decideRobots("/private/a",r).allowed,false);assert.equal(decideRobots("/private/public/file",r).allowed,true);assert.equal(decideRobots("/tmp-cache",r).allowed,false);assert.equal(decideRobots("/normal",r).allowed,true)});
test("specific user-agent group supersedes wildcard",()=>{const r=parseRobots("User-agent: *\nDisallow: /blocked\nUser-agent: AethericaBrowser\nAllow: /blocked\nDisallow: /private\n");assert.equal(decideRobots("/blocked",r).allowed,true);assert.equal(decideRobots("/private",r).allowed,false)});
test("robots HTTP error policy",()=>{assert.equal(robotsFetchStatusAllowed(404),true);assert.equal(robotsFetchStatusAllowed(403),true);assert.equal(robotsFetchStatusAllowed(503),false);assert.equal(robotsFetchStatusAllowed(200),true)});
