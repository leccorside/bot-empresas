import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiService } from './service';

@Controller()
export class ApiController {
  constructor(private readonly service:ApiService) {}
  @Get('health') health(){return this.service.health()}
  @Post('auth/login') login(@Body() body:any){return this.service.login(body)}
  @Get('dashboard') dashboard(){return this.service.dashboard()}
  @Get('runs') runs(){return this.service.runs()}
  @Post('runs') createRun(@Body() body:any){return this.service.createRun(body)}
  @Post('runs/:id/:action') runAction(@Param('id') id:string,@Param('action') action:string){return this.service.runAction(id,action)}
  @Get('businesses') businesses(@Query() query:any){return this.service.businesses(query)}
  @Get('businesses/filter-options') businessFilterOptions(){return this.service.businessFilterOptions()}
  @Get('businesses/:id') business(@Param('id') id:string){return this.service.business(id)}
  @Patch('businesses/:id/status') leadStatus(@Param('id') id:string,@Body() body:any){return this.service.leadStatus(id,body)}
  @Get('schedules') schedules(){return this.service.schedules()}
  @Post('schedules') createSchedule(@Body() body:any){return this.service.createSchedule(body)}
  @Patch('schedules/:id') updateSchedule(@Param('id') id:string,@Body() body:any){return this.service.updateSchedule(id,body)}
  @Delete('schedules/:id') deleteSchedule(@Param('id') id:string){return this.service.deleteSchedule(id)}
  @Get('jobs') jobs(){return this.service.jobs()}
  @Post('jobs/:id/:action') jobAction(@Param('id') id:string,@Param('action') action:string){return this.service.jobAction(id,action)}
  @Get('campaigns') campaigns(){return this.service.campaigns()}
  @Post('campaigns') createCampaign(@Body() body:any){return this.service.createCampaign(body)}
  @Post('campaigns/:id/schedule') scheduleCampaign(@Param('id') id:string){return this.service.scheduleCampaign(id)}
  @Get('settings') settings(){return this.service.settings()}
  @Post('settings/emergency/:action') emergency(@Param('action') action:string){return this.service.emergency(action)}
  @Get('exports') exports(){return this.service.listExports()}
  @Post('exports/businesses') createExport(@Body() body:any){return this.service.createExport(body)}
  @Get('exports/:id/download') downloadExport(@Param('id') id:string,@Res() res:any){return this.service.downloadExport(id,res)}
  @Get('exports/businesses.csv') exportCsv(@Res() res:any){return this.service.exportCsv(res)}
  @Get('exports/businesses.xlsx') exportXlsx(@Res() res:any){return this.service.exportXlsx(res)}
}
