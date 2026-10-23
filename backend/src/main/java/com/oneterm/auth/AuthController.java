package com.oneterm.auth;

import com.oneterm.auth.AuthDtos.AvailableModelDto;
import com.oneterm.auth.AuthDtos.LoginRequest;
import com.oneterm.auth.AuthDtos.PreferredModelRequest;
import com.oneterm.auth.AuthDtos.SimpleSuccessResponse;
import com.oneterm.auth.AuthDtos.UserProfileResponse;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/login")
    public UserProfileResponse login(@RequestBody LoginRequest request, HttpServletRequest httpRequest) {
        return authService.login(request, httpRequest);
    }

    @PostMapping("/logout")
    public SimpleSuccessResponse logout(HttpServletRequest httpRequest) {
        authService.logout(httpRequest);
        return new SimpleSuccessResponse(true, "已安全退出登录");
    }

    @GetMapping("/me")
    public UserProfileResponse me() {
        return authService.getMe();
    }

    @GetMapping("/models")
    public List<AvailableModelDto> getModels() {
        return authService.getAvailableModels();
    }

    @PutMapping("/preferred-model")
    public UserProfileResponse updatePreferredModel(@RequestBody PreferredModelRequest request) {
        return authService.updatePreferredModel(request);
    }

    @PostMapping("/demo-load")
    public UserProfileResponse demoLoad(HttpServletRequest httpRequest) {
        return authService.demoLoad(httpRequest);
    }
}
