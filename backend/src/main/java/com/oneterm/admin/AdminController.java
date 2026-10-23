package com.oneterm.admin;

import com.oneterm.admin.AdminDtos.AdminUserDto;
import com.oneterm.admin.AdminDtos.CreateUserRequest;
import com.oneterm.admin.AdminDtos.LlmConfigDto;
import com.oneterm.admin.AdminDtos.ResetPasswordRequest;
import com.oneterm.admin.AdminDtos.SaveLlmConfigRequest;
import com.oneterm.admin.AdminDtos.SimpleSuccessResponse;
import com.oneterm.admin.AdminDtos.UpdateUserRequest;
import com.oneterm.admin.AdminDtos.UsageLogDto;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final AdminService adminService;

    public AdminController(AdminService adminService) {
        this.adminService = adminService;
    }

    @GetMapping("/users")
    public List<AdminUserDto> listUsers() {
        return adminService.listUsers();
    }

    @PostMapping("/users")
    public ResponseEntity<AdminUserDto> createUser(@RequestBody CreateUserRequest request) {
        AdminUserDto created = adminService.createUser(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PutMapping("/users/{id}")
    public AdminUserDto updateUser(@PathVariable("id") long id, @RequestBody UpdateUserRequest request) {
        return adminService.updateUser(id, request);
    }

    @PostMapping("/users/{id}/reset-password")
    public SimpleSuccessResponse resetPassword(
            @PathVariable("id") long id,
            @RequestBody ResetPasswordRequest request
    ) {
        adminService.resetPassword(id, request);
        return new SimpleSuccessResponse(true, "密码已重置并解除登录锁定");
    }

    @GetMapping("/llm-configs")
    public List<LlmConfigDto> listLlmConfigs() {
        return adminService.listLlmConfigs();
    }

    @PostMapping("/llm-configs")
    public ResponseEntity<LlmConfigDto> createLlmConfig(@RequestBody SaveLlmConfigRequest request) {
        LlmConfigDto created = adminService.createLlmConfig(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PutMapping("/llm-configs/{id}")
    public LlmConfigDto updateLlmConfig(
            @PathVariable("id") long id,
            @RequestBody SaveLlmConfigRequest request
    ) {
        return adminService.updateLlmConfig(id, request);
    }

    @DeleteMapping("/llm-configs/{id}")
    public SimpleSuccessResponse deleteLlmConfig(@PathVariable("id") long id) {
        adminService.deleteLlmConfig(id);
        return new SimpleSuccessResponse(true, "模型配置已删除");
    }

    @GetMapping("/usage-logs")
    public List<UsageLogDto> listUsageLogs(@RequestParam(name = "userId", required = false) Long userId) {
        return adminService.listUsageLogs(userId);
    }
}
